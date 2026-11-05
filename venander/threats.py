"""Minacciare un'area.

Chi minaccia sceglie degli esagoni: chi ci entra lo interrompe e può essere
attaccato. La minaccia dura fino al turno successivo di chi l'ha dichiarata.
"""
import html
import re
import uuid
from flask_socketio import emit
from venander.combat import is_players_turn, spend_limb_frames
from venander.compendium import compendium_attack_range, get_action_speed_rule, get_compendium_item
from venander.core import db, socketio
from venander.hexes import hex_distance
from venander.models import Character
from venander.permissions import controls_character, emit_combat_error
from venander.serialization import emit_to_masters
from venander.state import client_roles, combat_state, combat_threats
from venander.undo import undoable
from venander.utils import format_number


def threats_visible_to(role):
    # Le minacce degli NPC restano segrete ai giocatori
    return [t for t in combat_threats if role == "master" or t["owner_role"] == "player"]


def emit_threats():
    for sid, role in list(client_roles.items()):
        socketio.emit("threats_update", threats_visible_to(role), to=sid)


def clear_threats_of(char_id):
    """Una minaccia dura fino al turno successivo di chi l'ha dichiarata."""
    before = len(combat_threats)
    combat_threats[:] = [t for t in combat_threats if t["char_id"] != char_id]
    if len(combat_threats) != before:
        emit_threats()


def find_threat_stop(mover, path):
    """Primo esagono del percorso in cui il personaggio entra in un'area minacciata da altri.

    Restituisce (indice nel percorso, minacce scattate) oppure (None, []).
    """
    def inside(threat, hex_pos):
        return f"{hex_pos[0]},{hex_pos[1]}" in threat["hexes"]

    # Scatta per chiunque entri, tranne chi minaccia: è lui a decidere se agire o lasciar passare
    other_threats = [t for t in combat_threats if t["char_id"] != mover.id]

    for index in range(1, len(path)):
        entered = [
            t for t in other_threats
            if inside(t, path[index]) and not inside(t, path[index - 1])
        ]
        if entered:
            return index, entered

    return None, []


THREAT_ACTION = "Minacciare un'area"


def threat_reach(char):
    """Portata per Minacciare: la gittata più lunga tra le armi equipaggiate (almeno 1)."""
    best = 1.0
    stats = char.stats or {}
    equipped = list((stats.get("equipped") or {}).values()) + list((stats.get("equipped_gadgets") or {}).values())

    for item in equipped:
        if not isinstance(item, dict):
            continue
        comp = item.get("custom_definition") if isinstance(item.get("custom_definition"), dict) else get_compendium_item(
            compendium_id=item.get("compendium_id"), name=item.get("name")
        )
        attack_range = compendium_attack_range(comp)
        if attack_range is not None:
            best = max(best, attack_range)

    return best


@socketio.on("request_threat_reach")
def handle_request_threat_reach(data):
    char = db.session.get(Character, (data or {}).get("char_id"))
    if not controls_character(char):
        return
    emit("threat_reach", {"char_id": char.id, "reach": threat_reach(char), "x": char.pos_x, "y": char.pos_y})


def start_threat_interrupts(intruder, threats):
    for threat in threats:
        threatener = db.session.get(Character, threat["char_id"])
        if not threatener:
            continue

        combat_state["interrupts"].append({
            "threat_id": threat["id"],
            "threatener_id": threatener.id,
            "threatener_name": threatener.name,
            "intruder_id": intruder.id,
            "intruder_name": intruder.name
        })

        # Una minaccia segreta di un NPC si rivela solo quando scatta
        socketio.emit("dice_result", {
            "name": "SISTEMA",
            "message": (
                f"⚡ <b>{html.escape(intruder.name)}</b> entra nell'area minacciata da "
                f"<b>{html.escape(threatener.name)}</b>, che agisce per primo!"
            ),
            "is_master_roll": False
        })

    socketio.emit("combat_update", combat_state)


@socketio.on("declare_threat")
@undoable("Minaccia")
def handle_declare_threat(data):
    data = data or {}
    char = db.session.get(Character, data.get("char_id"))

    if not combat_state.get("is_active") or not controls_character(char) or not is_players_turn(char):
        return

    # Esagoni scelti uno a uno, solo entro la portata dell'arma
    reach = threat_reach(char)
    hexes = []
    for raw in data.get("hexes") or []:
        match = re.match(r"^(-?\d+),(-?\d+)$", str(raw))
        if not match:
            continue
        col, row = int(match.group(1)), int(match.group(2))
        key = f"{col},{row}"
        if key not in hexes and hex_distance(char.pos_x, char.pos_y, col, row) <= reach:
            hexes.append(key)

    if not hexes:
        emit_combat_error(f"Scegli almeno un esagono entro la portata della tua arma ({format_number(reach)} m).")
        return

    rule = get_action_speed_rule(THREAT_ACTION)
    if not rule:
        emit_combat_error("Azione di minaccia non presente nella tabella.")
        return

    cost = int(rule.get("frames", 0))
    limb_error = spend_limb_frames(char.id, data.get("limb_shares") or {}, cost)
    if limb_error:
        emit_combat_error(limb_error)
        return

    combat_threats.append({
        "id": str(uuid.uuid4()),
        "char_id": char.id,
        "char_name": char.name,
        "owner_role": char.role,
        "hexes": hexes
    })
    emit_threats()

    # Le minacce degli NPC non si annunciano ai giocatori
    message = {
        "name": char.name,
        "message": f"minaccia {len(hexes)} esagoni spendendo <b>{cost} Frame</b>.",
        "is_master_roll": False
    }
    if char.role == "npc":
        emit_to_masters("dice_result", message)
    else:
        emit("dice_result", message, broadcast=True)


@socketio.on("cancel_threat")
@undoable("Minaccia ritirata")
def handle_cancel_threat(data):
    """Chi minaccia (o il Master) ritira la zona quando vuole, anche fuori turno."""
    threat = next((t for t in combat_threats if t["id"] == (data or {}).get("threat_id")), None)
    if not threat:
        return

    owner = db.session.get(Character, threat["char_id"])
    if not controls_character(owner):
        return

    combat_threats[:] = [t for t in combat_threats if t["id"] != threat["id"]]
    emit_threats()

    message = {"name": owner.name, "message": "ritira la minaccia.", "is_master_roll": False}
    if owner.role == "npc":
        emit_to_masters("dice_result", message)
    else:
        socketio.emit("dice_result", message)


@socketio.on("end_interrupt")
@undoable("Fine interruzione")
def handle_end_interrupt():
    if not combat_state.get("interrupts"):
        return

    interrupt = combat_state["interrupts"][0]
    if not controls_character(db.session.get(Character, interrupt["threatener_id"])):
        return

    combat_state["interrupts"].pop(0)
    socketio.emit("dice_result", {
        "name": "SISTEMA",
        "message": f"⚡ Fine interruzione di <b>{html.escape(interrupt['threatener_name'])}</b>.",
        "is_master_roll": False
    })
    socketio.emit("combat_update", combat_state)
