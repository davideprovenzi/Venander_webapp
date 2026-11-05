"""Bottino.

Il Master sceglie cosa si può prendere dal corpo di un NPC: lo sposta
dall'inventario dell'NPC al suo "bottino" (quello che resta addosso non si
tocca). Quando l'NPC è a terra, un giocatore adiacente lo fruga e prende
quello che vuole. Fuori dal combattimento è gratis; in combattimento si fa
nel proprio turno e costa "Raccogliere un oggetto da terra".
"""
import copy
import html
import uuid
from sqlalchemy.orm.attributes import flag_modified
from venander.ammo import return_ammo_to_backpack
from venander.combat import in_combat_turn_order, is_players_turn, spend_arms
from venander.compendium import get_action_speed_rule
from venander.core import db, socketio
from venander.hexes import hex_distance
from venander.models import Character
from venander.permissions import controls_character, emit_combat_error, is_master_request
from venander.serialization import emit_character_update, is_lootable_corpse
from venander.undo import undoable


LOOT_ACTION = "Raccogliere un oggetto da terra"

LOOT_REACH = 1

EQUIP_ONLY_KEYS = ("equip_group_id", "equipped_slots", "original_type", "ammo_loaded")


def item_matches(a, b):
    if a.get("compendium_id") and b.get("compendium_id"):
        return a["compendium_id"] == b["compendium_id"]
    return str(a.get("name", "")).casefold() == str(b.get("name", "")).casefold()


def add_to_backpack(backpack, item, qty):
    for entry in backpack:
        if isinstance(entry, dict) and not entry.get("npc_ammo") and item_matches(entry, item):
            entry["qty"] = int(entry.get("qty", 1) or 1) + qty
            return
    backpack.append({**item, "qty": qty})


@socketio.on("loot_add")
@undoable("Bottino preparato")
def handle_loot_add(data):
    """Il Master sposta un oggetto (o del denaro) dall'NPC al suo bottino."""
    if not is_master_request():
        return
    data = data or {}
    npc = db.session.get(Character, data.get("char_id"))
    if not npc or npc.role != "npc":
        return

    source = data.get("source")
    loot = list(npc.loot or [])
    entry = {"id": uuid.uuid4().hex}

    if source == "money":
        try:
            amount = max(1, int(data.get("amount")))
        except (TypeError, ValueError):
            return
        entry.update(kind="money", amount=amount)

    elif source == "backpack":
        backpack = copy.deepcopy(npc.backpack or [])
        try:
            index = int(data.get("index"))
            item = backpack[index]
        except (TypeError, ValueError, IndexError):
            return
        if not isinstance(item, dict) or item.get("npc_ammo"):
            return
        have = int(item.get("qty", 1) or 1)
        try:
            qty = max(1, min(have, int(data.get("qty") or have)))
        except (TypeError, ValueError):
            qty = have
        entry.update(kind="item", qty=qty, item={k: v for k, v in item.items() if k != "qty"})
        if qty >= have:
            backpack.pop(index)
        else:
            item["qty"] = have - qty
        npc.backpack = backpack
        flag_modified(npc, "backpack")

    elif source == "weapons":
        weapons = copy.deepcopy(npc.weapons or [])
        try:
            index = int(data.get("index"))
            item = weapons.pop(index)
        except (TypeError, ValueError, IndexError):
            return
        entry.update(kind="weapon", qty=1, item=item)
        npc.weapons = weapons
        flag_modified(npc, "weapons")

    elif source in ("equipped", "equipped_gadgets"):
        stats = copy.deepcopy(npc.stats or {})
        slots = stats.get(source) or {}
        item = slots.get(data.get("slot"))
        if not isinstance(item, dict):
            return
        # Un oggetto su più slot (guanti, spallacci...) si toglie da tutti
        group = item.get("equip_group_id")
        for key, other in list(slots.items()):
            if key == data.get("slot") or (group and isinstance(other, dict) and other.get("equip_group_id") == group):
                slots[key] = None
        kind = "weapon" if item.get("original_type") == "weapon" else "item"
        entry.update(kind=kind, qty=1, item={k: v for k, v in item.items() if k not in EQUIP_ONLY_KEYS})
        stats[source] = slots
        npc.stats = stats
        flag_modified(npc, "stats")
        # I colpi nel caricatore restano all'NPC (zaino o scorta globale):
        # il Master può metterli nel bottino a parte
        if item.get("ammo_loaded"):
            backpack = copy.deepcopy(npc.backpack or [])
            return_ammo_to_backpack(backpack, item["ammo_loaded"])
            npc.backpack = backpack
            flag_modified(npc, "backpack")
    else:
        return

    loot.append(entry)
    npc.loot = loot
    flag_modified(npc, "loot")
    db.session.commit()
    emit_character_update(npc)


@socketio.on("loot_return")
@undoable("Bottino tolto")
def handle_loot_return(data):
    """Il Master rimette addosso all'NPC un oggetto del bottino."""
    if not is_master_request():
        return
    data = data or {}
    npc = db.session.get(Character, data.get("char_id"))
    entry = next((e for e in (npc.loot or []) if e["id"] == data.get("loot_id")), None) if npc else None
    if not entry:
        return

    if entry["kind"] == "weapon":
        npc.weapons = list(npc.weapons or []) + [entry["item"]]
        flag_modified(npc, "weapons")
    elif entry["kind"] == "item":
        backpack = copy.deepcopy(npc.backpack or [])
        add_to_backpack(backpack, entry["item"], int(entry.get("qty", 1)))
        npc.backpack = backpack
        flag_modified(npc, "backpack")
    npc.loot = [e for e in npc.loot if e["id"] != entry["id"]]
    flag_modified(npc, "loot")
    db.session.commit()
    emit_character_update(npc)


@socketio.on("loot_take")
@undoable("Bottino preso")
def handle_loot_take(data):
    """Un giocatore prende dal corpo uno o tutti gli oggetti del bottino."""
    data = data or {}
    taker = db.session.get(Character, data.get("char_id"))
    npc = db.session.get(Character, data.get("npc_id"))
    if not taker or taker.role != "player" or not controls_character(taker):
        return
    if not is_lootable_corpse(npc):
        emit_combat_error("Si può frugare solo il corpo di un NPC a terra.")
        return
    if hex_distance(taker.pos_x, taker.pos_y, npc.pos_x, npc.pos_y) > LOOT_REACH:
        emit_combat_error(f"Avvicinati a {npc.name} per frugarlo.")
        return

    loot = copy.deepcopy(npc.loot or [])
    wanted = loot if data.get("all") else [e for e in loot if e["id"] == data.get("loot_id")]
    if not wanted:
        emit_combat_error("Questo oggetto non c'è più: qualcuno l'ha già preso.")
        return

    # Quantità parziale (es. 2 proiettili su 10): solo prendendo un oggetto alla volta
    partial = None
    if not data.get("all") and wanted[0]["kind"] == "item":
        try:
            partial = max(1, min(int(wanted[0].get("qty", 1)), int(data.get("qty") or wanted[0].get("qty", 1))))
        except (TypeError, ValueError):
            partial = None

    cost_text = ""
    if in_combat_turn_order(taker):
        if not is_players_turn(taker):
            emit_combat_error("In combattimento si fruga solo nel proprio turno.")
            return
        rule = get_action_speed_rule(LOOT_ACTION)
        cost = int((rule or {}).get("frames", 40))
        limb_error = spend_arms(taker.id, cost)
        if limb_error:
            emit_combat_error(limb_error)
            return
        cost_text = f" (<b>{cost} Frame</b>)"

    backpack = copy.deepcopy(taker.backpack or [])
    weapons = list(taker.weapons or [])
    taken_names = []
    taken_ids = set()
    for entry in wanted:
        if entry["kind"] == "money":
            taker.xp = int(taker.xp or 0) + int(entry["amount"])
            taken_names.append(f"{entry['amount']} €")
            taken_ids.add(entry["id"])
        elif entry["kind"] == "weapon":
            weapons.append(entry["item"])
            taken_names.append(entry["item"].get("name", "Arma"))
            taken_ids.add(entry["id"])
        else:
            qty = partial if partial is not None else int(entry.get("qty", 1))
            add_to_backpack(backpack, entry["item"], qty)
            taken_names.append(f"{entry['item'].get('name', 'Oggetto')}" + (f" ×{qty}" if qty > 1 else ""))
            if qty >= int(entry.get("qty", 1)):
                taken_ids.add(entry["id"])
            else:
                entry["qty"] = int(entry["qty"]) - qty

    taker.backpack = backpack
    taker.weapons = weapons
    flag_modified(taker, "backpack")
    flag_modified(taker, "weapons")
    npc.loot = [e for e in loot if e["id"] not in taken_ids]
    flag_modified(npc, "loot")
    db.session.commit()

    emit_character_update(taker)
    emit_character_update(npc)
    socketio.emit("dice_result", {
        "name": taker.name,
        "message": f"💰 fruga <b>{html.escape(npc.name)}</b> e prende: " + ", ".join(f"<b>{html.escape(n)}</b>" for n in taken_names) + f"{cost_text}.",
        "is_master_roll": False
    })
