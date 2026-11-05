"""Il pulsante "Annulla" del Master: ripristina l'ultima foto della pila (vedi undo.py).
"""
import copy
import html
from sqlalchemy.orm.attributes import flag_modified
from venander.aiming import emit_aims
from venander.core import db, socketio
from venander.exchange import emit_exchanges
from venander.models import Character, WorldState
from venander.permissions import emit_combat_error, is_master_request
from venander.serialization import emit_character_update, emit_pending_attacks_to_sid, emit_to_masters
from venander.state import (
    client_character_ids,
    client_roles,
    combat_aims,
    combat_state,
    combat_threats,
    pending_attacks,
    pending_combat_results,
    pending_exchanges,
    pending_explosions,
    pending_surface_prompts,
)
from venander.threats import emit_threats
from venander.trinkets import emit_explosions, emit_trinkets
from venander.undo import emit_undo_status, undo_stack


@socketio.on("undo_last_action")
def handle_undo_last_action():
    if not is_master_request():
        return
    if not undo_stack:
        emit_combat_error("Non c'è niente da annullare.")
        return

    snapshot = undo_stack.pop()
    current_attacks = set(pending_attacks)
    current_results = set(pending_combat_results)
    current_prompts = set(pending_surface_prompts)

    # Stato in memoria: si svuotano e riempiono gli stessi dizionari
    for live, saved in (
        (combat_state, snapshot["combat_state"]),
        (pending_attacks, snapshot["pending_attacks"]),
        (pending_combat_results, snapshot["pending_results"]),
        (pending_surface_prompts, snapshot["surface_prompts"]),
        (pending_explosions, snapshot["explosions"]),
        (pending_exchanges, snapshot["exchanges"]),
    ):
        live.clear()
        live.update(copy.deepcopy(saved))
    combat_threats[:] = copy.deepcopy(snapshot["threats"])
    combat_aims[:] = copy.deepcopy(snapshot["aims"])

    ws = WorldState.query.first()
    if (ws.trinkets or []) != snapshot["trinkets"]:
        ws.trinkets = copy.deepcopy(snapshot["trinkets"])
        flag_modified(ws, "trinkets")

    changed_chars = []
    for char_id, fields in snapshot["characters"].items():
        char = db.session.get(Character, char_id)
        if not char:
            continue
        if any(getattr(char, field) != value for field, value in fields.items()):
            for field, value in fields.items():
                setattr(char, field, copy.deepcopy(value))
                if field in ("pa_stats", "bonuses", "stats", "weapons", "backpack"):
                    flag_modified(char, field)
            changed_chars.append(char)
    db.session.commit()

    for char in changed_chars:
        emit_character_update(char)

    socketio.emit("combat_update", combat_state)
    emit_threats()
    emit_aims()
    emit_trinkets()
    emit_explosions()
    emit_exchanges()

    # Popup legati all'azione annullata: chiusi o riaperti
    for attack_id in current_attacks - set(pending_attacks):
        socketio.emit("incoming_attack_cancelled", {"attack_id": attack_id})
    for sid, role in list(client_roles.items()):
        emit_pending_attacks_to_sid(sid, role, client_character_ids.get(sid))

    for result_id in current_results - set(pending_combat_results):
        emit_to_masters("master_combat_result_cancelled", {"result_id": result_id})
    for result_id in set(pending_combat_results) - current_results:
        emit_to_masters("master_pending_combat_result", pending_combat_results[result_id])

    for prompt_id in current_prompts - set(pending_surface_prompts):
        emit_to_masters("surface_prompt_closed", {"id": prompt_id})
    for prompt_id in set(pending_surface_prompts) - current_prompts:
        emit_to_masters("surface_prompt", pending_surface_prompts[prompt_id])

    socketio.emit("dice_result", {
        "name": "SISTEMA",
        "message": f"↩️ Il Master ha annullato: <b>{html.escape(snapshot['label'])}</b>",
        "is_master_roll": True
    })
    emit_undo_status()
