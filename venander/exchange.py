"""Scambio d'attacco.

Il difensore (B) risponde all'attaccante (A) attaccando: i due tirano
d20 + velocità/10 (pareggio = si ritira). Dai tiri:
  - vince A: A colpisce, B non può difendersi;
  - vince B di 5 o più: B non subisce niente e il suo colpo va a segno;
  - vince B di meno di 5: colpiscono entrambi, il Master decide quanto.
Il Master conferma l'esito proposto o ne sceglie un altro; ogni colpo a segno
passa poi dalla sua revisione (esito già su "Colpito", danno modificabile).
"""
import html
import random
import uuid
from venander.ammo import firearm_spec, set_loaded_ammo
from venander.compendium import compendium_attack_range, get_compendium_item, missing_weapon_license
from venander.core import db, socketio
from venander.equipment import get_equipped_attack_item, resolve_attack_damage
from venander.hexes import hex_distance
from venander.models import Character
from venander.permissions import controls_character, is_master_request
from venander.review import build_pending_result
from venander.serialization import emit_character_update
from venander.state import pending_attacks, pending_exchanges
from venander.undo import undoable


# B deve vincere di almeno tanto per colpire senza prendere niente
EXCHANGE_CLEAN_MARGIN = 5

# Esiti dello scambio: testo del pulsante / della chat
EXCHANGE_RESULTS = {
    "attacker": "vince l'attaccante e colpisce",
    "defender": "vince chi risponde, netto: colpisce solo lui",
    "both": "vince chi risponde di poco: colpiscono entrambi",
}


def exchange_result_from_rolls(attacker_total, defender_total):
    """Esito proposto dai tiri (None in caso di pareggio)."""
    if attacker_total == defender_total:
        return None
    if attacker_total > defender_total:
        return "attacker"
    return "defender" if defender_total - attacker_total >= EXCHANGE_CLEAN_MARGIN else "both"


def emit_exchanges():
    socketio.emit("exchanges_update", list(pending_exchanges.values()))


def build_counter_attack(char, target, choice, speed):
    """L'attacco che il difensore porterebbe vincendo lo scambio (o un messaggio d'errore)."""
    requested_name = str(choice.get("weapon") or "Mani Nude").strip() or "Mani Nude"
    source_slot = choice.get("source_slot") or None
    compendium_id = choice.get("compendium_id") or None
    is_unarmed = requested_name.casefold() in {"pugno dx", "pugno sx", "mani nude"}

    equipped_slot, equipped_item = get_equipped_attack_item(
        char, source_slot=source_slot, compendium_id=compendium_id, weapon_name=requested_name
    )
    if not is_unarmed and not equipped_item:
        return "Per lo scambio scegli un'arma che hai equipaggiata."

    custom_definition = (equipped_item or {}).get("custom_definition")
    if isinstance(custom_definition, dict):
        comp_item = custom_definition
    else:
        comp_item = get_compendium_item(
            compendium_id=compendium_id or (equipped_item or {}).get("compendium_id"),
            name=(equipped_item or {}).get("name") if equipped_item else requested_name
        )
    weapon_name = comp_item.get("name") if comp_item else (equipped_item or {}).get("name", requested_name)

    required_license = missing_weapon_license(char, comp_item)
    if required_license:
        return f"Per usare {weapon_name} manca la licenza {required_license}."

    distance = hex_distance(char.pos_x, char.pos_y, target.pos_x, target.pos_y)
    attack_range = compendium_attack_range(comp_item)
    if is_unarmed and attack_range is None:
        attack_range = 1.0
    if attack_range is not None and distance > attack_range:
        return f"{weapon_name} non arriva: {distance} m, massimo {attack_range:g} m."

    if firearm_spec(comp_item) and equipped_item and int((equipped_item.get("ammo_loaded") or {}).get("count", 0) or 0) < 1:
        return f"{weapon_name} è scarica."

    damage_data = ((comp_item or {}).get("combat") or {}).get("damage") or {}
    damage_resolution = resolve_attack_damage(comp_item, char, distance, weapon_name=weapon_name)
    return {
        "attack_id": str(uuid.uuid4()),
        "attacker_id": char.id,
        "attacker_name": char.name,
        "defender_id": target.id,
        "defender_name": target.name,
        "weapon": weapon_name,
        "speed": speed,
        "compendium_id": compendium_id or (equipped_item or {}).get("compendium_id"),
        "source_slot": equipped_slot or source_slot,
        "damage_formula": damage_data.get("formula"),
        "damage_type": damage_data.get("type"),
        "resolved_damage": damage_resolution.get("damage"),
        "resolved_damage_formula": damage_resolution.get("formula"),
        "damage_automatic": damage_resolution.get("automatic", False),
        "damage_note": damage_resolution.get("note"),
        "range": attack_range,
        "distance": distance,
        "activation_mode": ((comp_item or {}).get("activation") or {}).get("mode"),
        "area_shape": (((comp_item or {}).get("combat") or {}).get("area") or {}).get("shape"),
        "aim": None,
        "is_firearm": bool(firearm_spec(comp_item)),
        "no_exchange": True
    }


def start_exchange(attack, counter, attacker, defender, def_speed):
    pending_attacks.pop(attack["attack_id"], None)
    exchange = {
        "id": str(uuid.uuid4()),
        "attack": attack,
        "counter": counter,
        "sides": [
            {"char_id": attacker.id, "name": attacker.name, "weapon": attack.get("weapon"), "speed": int(attack.get("speed") or 0), "roll": None},
            {"char_id": defender.id, "name": defender.name, "weapon": counter["weapon"], "speed": int(def_speed), "roll": None}
        ],
        "proposed_winner": None,
        "proposed_result": None
    }
    pending_exchanges[exchange["id"]] = exchange
    socketio.emit("dice_result", {
        "name": defender.name,
        "message": (
            f"⚔️ risponde con uno <b>Scambio d'Attacco</b> ({html.escape(str(counter['weapon']))}, Velocità <b>{def_speed}</b>)! "
            f"<b>{html.escape(attacker.name)}</b> e <b>{html.escape(defender.name)}</b> tirano per vedere chi colpisce."
        ),
        "is_master_roll": False
    })
    emit_exchanges()


@socketio.on("exchange_roll")
@undoable("Tiro dello scambio")
def handle_exchange_roll(data):
    data = data or {}
    exchange = pending_exchanges.get(data.get("exchange_id"))
    if not exchange:
        return
    side = next((s for s in exchange["sides"] if str(s["char_id"]) == str(data.get("char_id"))), None)
    char = db.session.get(Character, side["char_id"]) if side else None
    if not char or not controls_character(char) or side["roll"] is not None:
        return

    die = random.randint(1, 20)
    bonus = side["speed"] // 10
    side["roll"] = {"die": die, "bonus": bonus, "total": die + bonus}
    socketio.emit("dice_result", {
        "name": char.name,
        "message": f"🎲 Scambio: d20 <b>{die}</b> + {bonus} (velocità) = <b>{die + bonus}</b>",
        "is_master_roll": False
    })

    a, b = exchange["sides"]
    if a["roll"] and b["roll"]:
        result = exchange_result_from_rolls(a["roll"]["total"], b["roll"]["total"])
        if result is None:
            a["roll"] = b["roll"] = None
            exchange["proposed_winner"] = exchange["proposed_result"] = None
            socketio.emit("dice_result", {"name": "SISTEMA", "message": "⚔️ Scambio in parità: si ritira!", "is_master_roll": False})
        else:
            exchange["proposed_result"] = result
            exchange["proposed_winner"] = (a if result == "attacker" else b)["char_id"]
    emit_exchanges()


@socketio.on("exchange_decide")
@undoable("Esito dello scambio")
def handle_exchange_decide(data):
    """Il Master conferma l'esito proposto dai tiri o ne sceglie un altro (vedi EXCHANGE_RESULTS)."""
    if not is_master_request():
        return
    data = data or {}
    exchange = pending_exchanges.get(data.get("exchange_id"))
    if not exchange:
        return
    result = data.get("result")
    if result not in EXCHANGE_RESULTS:
        # Vecchi client: si sceglieva solo il vincitore
        winner_id = str(data.get("winner_id"))
        if winner_id == str(exchange["sides"][0]["char_id"]):
            result = "attacker"
        elif winner_id == str(exchange["sides"][1]["char_id"]):
            result = "defender"
        else:
            return

    pending_exchanges.pop(exchange["id"], None)
    emit_exchanges()

    attack = {**exchange["attack"], "no_exchange": True}
    counter = dict(exchange["counter"])
    attacker = db.session.get(Character, attack["attacker_id"])
    defender = db.session.get(Character, counter["attacker_id"])
    if not attacker or not defender:
        return

    socketio.emit("dice_result", {
        "name": "SISTEMA",
        "message": f"⚔️ Scambio tra <b>{html.escape(attacker.name)}</b> e <b>{html.escape(defender.name)}</b>: {EXCHANGE_RESULTS[result]}.",
        "is_master_roll": False
    })

    # Ogni colpo a segno va dritto alla revisione del Master, senza reazione
    if result in ("attacker", "both"):
        label = "Scambio perso" if result == "attacker" else "Scambio: colpiscono entrambi (danno a tua scelta)"
        build_pending_result(attack, attacker, defender, "Nessuna", label, 0, "bd", sure_hit=True)
    if result in ("defender", "both"):
        fire_counter_weapon(defender, counter)
        label = "Scambio vinto netto" if result == "defender" else "Scambio: colpiscono entrambi (danno a tua scelta)"
        build_pending_result(counter, defender, attacker, "Nessuna", label, 0, "bd", sure_hit=True)


def fire_counter_weapon(shooter, counter):
    """L'arma da fuoco di chi risponde spara davvero: un colpo in meno."""
    if not counter.pop("is_firearm", False) or not counter.get("source_slot"):
        return
    item = ((shooter.stats or {}).get("equipped") or {}).get(counter["source_slot"]) or {}
    loaded = item.get("ammo_loaded") or {}
    if int(loaded.get("count", 0) or 0) > 0:
        set_loaded_ammo(shooter, counter["source_slot"], {**loaded, "count": int(loaded["count"]) - 1})
        db.session.commit()
        emit_character_update(shooter)
