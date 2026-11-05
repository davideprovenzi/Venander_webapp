"""Riparazione rapida armatura.

I danni dell'armatura si ridistribuiscono: ogni pezzo indossato finisce alla
stessa percentuale della sua durabilità massima. Il totale non cambia. In
combattimento è un'azione (frame della tabella), fuori è gratis.
"""
import html
from sqlalchemy.orm.attributes import flag_modified
from venander.combat import is_players_turn, spend_limb_frames
from venander.compendium import get_action_speed_rule
from venander.core import db, socketio
from venander.equipment import armor_pieces, set_equipment_current_hp
from venander.models import Character
from venander.permissions import controls_character, emit_combat_error
from venander.serialization import emit_character_update
from venander.state import combat_state
from venander.undo import undoable


ARMOR_REPAIR_ACTION = "Riparazione rapida armatura"


def even_armor_durability(pieces):
    """Nuova durabilità per pezzo: stessa percentuale, punti avanzati ai resti più grandi."""
    total = sum(p["hp"] for p in pieces)
    total_max = sum(p["max_hp"] for p in pieces)
    if not total_max:
        return {}

    exact = {p["slot"]: p["max_hp"] * total / total_max for p in pieces}
    result = {slot: int(value) for slot, value in exact.items()}
    leftover = total - sum(result.values())
    for slot in sorted(exact, key=lambda s: exact[s] - result[s], reverse=True)[:leftover]:
        result[slot] += 1
    return result


@socketio.on("quick_armor_repair")
@undoable("Riparazione rapida armatura")
def handle_quick_armor_repair(data):
    data = data or {}
    char = db.session.get(Character, data.get("char_id"))
    if not controls_character(char):
        return

    pieces = armor_pieces(char)
    target = even_armor_durability(pieces)
    if len(pieces) < 2 or all(target.get(p["slot"]) == p["hp"] for p in pieces):
        emit_combat_error("Non c'è niente da ridistribuire tra i pezzi dell'armatura.")
        return

    # In combattimento è un'azione del proprio turno, che costa frame
    cost_text = ""
    in_combat = combat_state.get("is_active") and any(int(e.get("id", -1)) == char.id for e in combat_state.get("turn_order", []))
    if in_combat:
        if not is_players_turn(char):
            emit_combat_error("La riparazione rapida si fa nel proprio turno.")
            return
        if not data.get("limb_shares"):
            emit_combat_error("In combattimento usa 'Altra azione' → Riparazione rapida armatura (costa frame).")
            return
        rule = get_action_speed_rule(ARMOR_REPAIR_ACTION)
        cost = int((rule or {}).get("frames", 0))
        limb_error = spend_limb_frames(char.id, data["limb_shares"], cost)
        if limb_error:
            emit_combat_error(limb_error)
            return
        cost_text = f" (<b>{cost} Frame</b>)"

    for piece in pieces:
        set_equipment_current_hp(char, piece["slot"], target[piece["slot"]])
    flag_modified(char, "stats")
    db.session.commit()
    emit_character_update(char)

    summary = " · ".join(f"{html.escape(str(p['name']))} {target[p['slot']]}/{p['max_hp']}" for p in pieces)
    socketio.emit("dice_result", {
        "name": char.name,
        "message": f"🔧 ridistribuisce i danni dell'armatura{cost_text}: {summary}",
        "is_master_roll": False
    })
