"""Munizioni e caricatori.

Un'arma da fuoco (compendio con weapon.ammo) ha un caricatore: si carica con
proiettili dello zaino che citano il suo calibro o il suo nome, ogni colpo ne
usa uno, a vuoto non si spara. Ricaricare in combattimento costa i frame di
"Cambiare caricatore" della tabella azioni.
"""
import copy
import html
import re
from flask import request
from flask_socketio import emit
from sqlalchemy.orm.attributes import flag_modified
from venander.combat import SLOT_COMBAT_LIMBS, get_limb_frames, is_players_turn, spend_limb_frames
from venander.compendium import get_action_speed_rule, get_compendium_item
from venander.core import db, socketio
from venander.models import Character
from venander.permissions import controls_character, emit_combat_error, is_master_request
from venander.serialization import emit_character_update
from venander.state import combat_state
from venander.undo import undoable
from venander.utils import _clean_int


PROJECTILE_PATTERN = re.compile(r"\b(proiettil\w*|munizion\w*|fmj|pallettoni|cartucc\w*|bossol\w*)\b", re.IGNORECASE)


def firearm_spec(comp):
    """(calibro, capienza) per un'arma da fuoco, altrimenti None.

    Compendio: weapon.ammo = {"type": "9mm", "capacity": 20}.
    Armi della Fucina: weapon.ammo = "9mm" (testo) e weapon.ammo_qty = 20.
    """
    weapon = (comp or {}).get("weapon") or {}
    if not isinstance(weapon, dict):
        return None
    ammo = weapon.get("ammo")
    if isinstance(ammo, dict):
        caliber, raw_capacity = ammo.get("type"), ammo.get("capacity")
    elif isinstance(ammo, str) and ammo.strip() and ammo.strip().lower() not in ("none", "null", "-"):
        caliber, raw_capacity = ammo.strip(), weapon.get("ammo_qty")
    else:
        return None
    try:
        capacity = int(raw_capacity or 0)
    except (TypeError, ValueError):
        capacity = 0
    return (str(caliber or ""), capacity) if capacity > 0 else None


def equipped_item_compendium(item):
    if isinstance(item.get("custom_definition"), dict):
        return item["custom_definition"]
    return get_compendium_item(compendium_id=item.get("compendium_id"), name=item.get("name"))


def projectile_fits(entry, comp, gun_name):
    """Il proiettile deve citare il calibro dell'arma o il suo nome (es. "9mm", "revolver")."""
    text = f"{entry.get('name', '')} {entry.get('desc', '')}".lower()
    if not PROJECTILE_PATTERN.search(text):
        return False
    caliber = (firearm_spec(comp) or ("", 0))[0].lower()
    keys = {caliber, str(comp.get("name", "")).lower(), str(gun_name or "").lower()}
    return any(key and key in text for key in keys)


# Munizioni "globali" degli NPC: un'unica scorta per NPC, buona per qualsiasi
# arma da fuoco (niente calibro). Sta nello zaino come voce speciale, così
# passa anche ai modelli NPC; si ricarica dal caricatore come per i giocatori.
NPC_AMMO_NAME = "Munizioni NPC"


def npc_ammo_index(char):
    return next(
        (i for i, e in enumerate(char.backpack or []) if isinstance(e, dict) and e.get("npc_ammo")),
        None
    )


def ammo_qty(value, default=0):
    """Quantità di colpi come numero: testo strano ("20 colpi") o null valgono default."""
    return _clean_int(value, default, 0)


def compatible_ammo(char, comp, gun_name):
    fitting = []
    for index, entry in enumerate(char.backpack or []):
        if not isinstance(entry, dict) or ammo_qty(entry.get("qty", 1)) <= 0:
            continue
        if entry.get("npc_ammo"):
            if char.role == "npc":
                fitting.insert(0, (index, entry))   # la scorta globale per prima
        elif projectile_fits(entry, comp, gun_name):
            fitting.append((index, entry))
    return fitting


def return_ammo_to_backpack(backpack, loaded):
    """I colpi tolti dal caricatore tornano nello zaino (si sommano se c'è già la voce)."""
    count = ammo_qty(loaded.get("count"))
    if count <= 0:
        return
    if loaded.get("npc_ammo"):
        pool = next((e for e in backpack if isinstance(e, dict) and e.get("npc_ammo")), None)
        if pool is None:
            backpack.append({"name": NPC_AMMO_NAME, "qty": count, "desc": "Munizioni globali dell'NPC", "npc_ammo": True})
        else:
            pool["qty"] = ammo_qty(pool.get("qty")) + count
        return
    name = str(loaded.get("name") or "Proiettili")
    for entry in backpack:
        if isinstance(entry, dict) and not entry.get("npc_ammo") and str(entry.get("name") or "").lower() == name.lower():
            entry["qty"] = ammo_qty(entry.get("qty")) + count
            return
    backpack.append({"name": name, "qty": count, "desc": loaded.get("desc") or ""})


def return_unequipped_ammo(old_stats, new_stats, backpack):
    """Armi tolte di mano con colpi nel caricatore: i colpi tornano nello zaino.

    Il client rimette l'arma tra le armi senza il caricatore; senza questo
    controllo i colpi caricati sparivano. Restituisce True se ha cambiato lo zaino.
    """
    def loaded_guns(stats):
        guns = {}
        for slot, item in ((stats or {}).get("equipped") or {}).items():
            if isinstance(item, dict) and ammo_qty((item.get("ammo_loaded") or {}).get("count")) > 0:
                # Un'arma a due mani occupa due slot ma ha un solo caricatore
                guns.setdefault(item.get("equip_group_id") or f"slot:{slot}", item["ammo_loaded"])
        return guns

    still_equipped = loaded_guns(new_stats)
    gone = [loaded for key, loaded in loaded_guns(old_stats).items() if key not in still_equipped]
    for loaded in gone:
        return_ammo_to_backpack(backpack, loaded)
    return bool(gone)


def set_loaded_ammo(char, slot, loaded):
    """Scrive il caricatore su tutti gli slot dell'arma (anche a due mani)."""
    stats = copy.deepcopy(char.stats or {})
    equipped = stats.get("equipped") or {}
    group = (equipped.get(slot) or {}).get("equip_group_id")
    for key, item in equipped.items():
        if isinstance(item, dict) and (key == slot or (group and item.get("equip_group_id") == group)):
            item["ammo_loaded"] = loaded
    char.stats = stats
    flag_modified(char, "stats")


def load_firearm(char, slot, ammo_index):
    """Carica l'arma con i proiettili scelti. Restituisce (caricati, nome) oppure un errore (str)."""
    item = ((char.stats or {}).get("equipped") or {}).get(slot)
    comp = equipped_item_compendium(item) if isinstance(item, dict) else None
    spec = firearm_spec(comp)
    if not spec:
        return "Quest'arma non usa munizioni."

    fitting = dict(compatible_ammo(char, comp, item.get("name")))
    if ammo_index not in fitting:
        return f"Questi proiettili non vanno bene per {item.get('name')}."

    backpack = copy.deepcopy(char.backpack or [])
    entry = backpack[ammo_index]
    loaded_name, loaded_desc = str(entry.get("name") or "Proiettili"), entry.get("desc") or ""
    is_pool = bool(entry.get("npc_ammo"))

    # Scorta globale: i colpi rimasti nell'arma tornano prima nella scorta,
    # così il caricatore si riempie fino in fondo
    previous = item.get("ammo_loaded") or {}
    if is_pool and previous.get("npc_ammo") and ammo_qty(previous.get("count")):
        entry["qty"] = ammo_qty(entry.get("qty")) + ammo_qty(previous.get("count"))
        previous = {}
    take = min(spec[1], ammo_qty(entry.get("qty", 1), 1))

    entry["qty"] = ammo_qty(entry.get("qty", 1), 1) - take
    # La scorta globale resta anche a zero: il Master la vede e la riempie
    if entry["qty"] <= 0 and not is_pool:
        backpack.pop(ammo_index)

    # Quello che c'era nel caricatore torna nello zaino
    return_ammo_to_backpack(backpack, previous)

    char.backpack = backpack
    flag_modified(char, "backpack")
    loaded = {"name": loaded_name, "desc": loaded_desc, "count": take}
    if is_pool:
        loaded["npc_ammo"] = True
    set_loaded_ammo(char, slot, loaded)
    return take, loaded_name


def auto_load_new_firearms(char):
    """Un'arma da fuoco appena equipaggiata si carica da sola con i primi proiettili adatti."""
    for slot in list(((char.stats or {}).get("equipped") or {}).keys()):
        # Si rilegge ogni volta: caricando un'arma a due mani si aggiornano
        # entrambi gli slot, e il secondo non va caricato di nuovo
        item = ((char.stats or {}).get("equipped") or {}).get(slot)
        if not isinstance(item, dict) or "ammo_loaded" in item:
            continue
        comp = equipped_item_compendium(item)
        if not firearm_spec(comp):
            continue
        fitting = compatible_ammo(char, comp, item.get("name"))
        if fitting:
            load_firearm(char, slot, fitting[0][0])
        else:
            # Segna l'arma come vista: resta scarica finché non si ricarica
            set_loaded_ammo(char, slot, {"name": None, "desc": "", "count": 0})


@socketio.on("set_npc_ammo")
@undoable("Munizioni NPC")
def handle_set_npc_ammo(data):
    """Il Master imposta la scorta globale di colpi di un NPC."""
    if not is_master_request():
        return
    data = data or {}
    char = db.session.get(Character, data.get("char_id"))
    if not char or char.role != "npc":
        return
    try:
        count = max(0, min(9999, int(data.get("count"))))
    except (TypeError, ValueError):
        return

    backpack = copy.deepcopy(char.backpack or [])
    index = npc_ammo_index(char)
    if index is None:
        backpack.append({"name": NPC_AMMO_NAME, "qty": count, "desc": "Munizioni globali dell'NPC", "npc_ammo": True})
    else:
        backpack[index]["qty"] = count
    char.backpack = backpack
    flag_modified(char, "backpack")

    # Armi mai caricate si caricano subito; un caricatore svuotato sparando va
    # ricaricato con la solita azione (frame in combattimento)
    if count:
        for slot, item in list(((char.stats or {}).get("equipped") or {}).items()):
            if not isinstance(item, dict) or (item.get("ammo_loaded") or {}).get("name"):
                continue
            comp = equipped_item_compendium(item)
            if firearm_spec(comp) and npc_ammo_index(char) is not None and int(char.backpack[npc_ammo_index(char)].get("qty", 0)) > 0:
                load_firearm(char, slot, npc_ammo_index(char))

    db.session.commit()
    emit_character_update(char)
    emit("dice_result", {
        "name": "SISTEMA",
        "message": f"🎯 Munizioni globali di <b>{html.escape(char.name)}</b>: {count} colpi di scorta.",
        "is_master_roll": True
    }, to=request.sid)


@socketio.on("load_weapon")
@undoable("Ricarica")
def handle_load_weapon(data):
    data = data or {}
    char = db.session.get(Character, data.get("char_id"))
    if not controls_character(char):
        return

    slot = data.get("slot")
    item = ((char.stats or {}).get("equipped") or {}).get(slot)
    if not isinstance(item, dict):
        return

    try:
        ammo_index = int(data.get("ammo_index"))
    except (TypeError, ValueError):
        return

    # Prima si controlla arma e proiettili, poi (in combattimento) si pagano i frame
    comp = equipped_item_compendium(item)
    if not firearm_spec(comp):
        emit_combat_error("Quest'arma non usa munizioni.")
        return
    if ammo_index not in dict(compatible_ammo(char, comp, item.get("name"))):
        pool = (char.backpack or [])[ammo_index] if 0 <= ammo_index < len(char.backpack or []) else {}
        if char.role == "npc" and isinstance(pool, dict) and pool.get("npc_ammo"):
            emit_combat_error(f"{char.name} ha finito le munizioni globali.")
        else:
            emit_combat_error(f"Questi proiettili non vanno bene per {item.get('name')}.")
        return

    # In combattimento ricaricare è un'azione: nel proprio turno, pagando i frame
    cost_text = ""
    if combat_state.get("is_active") and any(int(e.get("id", -1)) == char.id for e in combat_state.get("turn_order", [])):
        if not is_players_turn(char):
            emit_combat_error("Puoi ricaricare solo nel tuo turno.")
            return
        kind = "pistola" if any(k in str((comp or {}).get("name", item.get("name"))).lower() for k in ("pistol", "revolver")) else "fucile"
        rule = get_action_speed_rule(f"Cambiare caricatore {kind}")
        cost = int((rule or {}).get("frames", 0))
        if cost:
            # Si ricarica a due mani: paga prima il braccio dell'arma, il resto l'altro
            gun_arm = SLOT_COMBAT_LIMBS.get(slot, "bd")
            other_arm = "bs" if gun_arm == "bd" else "bd"
            first = min(cost, get_limb_frames(char.id)[gun_arm])
            shares = {gun_arm: first, other_arm: cost - first}
            limb_error = spend_limb_frames(char.id, shares, cost)
            if limb_error:
                emit_combat_error(limb_error)
                return
            cost_text = f" (<b>{cost} Frame</b>)"

    result = load_firearm(char, slot, ammo_index)
    if isinstance(result, str):
        emit_combat_error(result)
        return

    db.session.commit()
    emit_character_update(char)

    count, ammo_name = result
    socketio.emit("dice_result", {
        "name": char.name,
        "message": f"🔄 ricarica <b>{html.escape(str(item.get('name')))}</b> con <b>{html.escape(str(ammo_name))}</b>: {count} colpi{cost_text}.",
        "is_master_roll": False
    })
