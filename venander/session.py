"""Connessione dei client e ruolo della sessione (Master o giocatore).
"""
from flask import request
from flask_socketio import emit
from venander.compendium import load_compendio
from venander.core import code_status, db, socketio
from venander.forge import get_master_forge_library
from venander.models import Character, DrawItem
from venander.npcs import get_npc_template_list
from venander.permissions import controls_character
from venander.scenes import get_scene_list
from venander.serialization import (
    clean_character_name,
    emit_character_update,
    emit_initial_state_to_sid,
    emit_pending_attacks_to_sid,
    get_world_state,
)
from venander.sidequests import emit_sidequest_list_to_sid
from venander.state import (
    client_character_ids,
    client_roles,
    combat_aims,
    combat_state,
    master_sids,
    pending_combat_results,
    pending_exchanges,
)
from venander.threats import threats_visible_to
from venander.trinkets import emit_explosions, trinkets_visible_to
from venander.undo import undo_stack
from venander.wiki import emit_wiki_list_to_sid


@socketio.on("register_session_role")
def handle_register_session_role(data):
    data = data or {}
    role = str(data.get("role", "")).strip().lower()
    role = "master" if role == "master" else "player"
    previous_role = client_roles.get(request.sid)
    previous_char_id = client_character_ids.get(request.sid)

    char_id = None
    if role == "player":
        try:
            candidate = int(data.get("char_id"))
        except (TypeError, ValueError):
            candidate = None

        if candidate:
            char = db.session.get(Character, candidate)
            if char and char.role == "player":
                char_id = char.id

    client_roles[request.sid] = role
    client_character_ids[request.sid] = char_id
    master_sids.discard(request.sid)

    if role == "master":
        master_sids.add(request.sid)

        # Sincronizza la Fucina persistente del Master.
        emit("master_forge_library", get_master_forge_library(), to=request.sid)

        # Se il Master ricarica la pagina mentre ci sono risultati
        # in attesa, glieli rimandiamo.
        for result in pending_combat_results.values():
            emit("master_pending_combat_result", result, to=request.sid)

    # Invia lo stato corretto solo alla prima registrazione o quando cambia ruolo.
    if previous_role != role:
        emit_initial_state_to_sid(request.sid, role)

    # Le sidequest dipendono anche dal personaggio selezionato.
    if previous_role != role or previous_char_id != char_id:
        emit_sidequest_list_to_sid(request.sid, role, char_id)

    # Gli handout del wiki dipendono dal personaggio scelto (e così i trinket visibili).
    if previous_role != role or previous_char_id != char_id:
        emit_wiki_list_to_sid(request.sid, role)
        socketio.emit("trinkets_update", trinkets_visible_to(role, char_id), to=request.sid)
        if role == "master":
            emit_explosions()
        # Attacchi ancora in attesa di reazione per questo personaggio
        emit_pending_attacks_to_sid(request.sid, role, char_id)

    # Il Master riceve anche le minacce degli NPC, le scene e i modelli NPC.
    if previous_role != role:
        socketio.emit("threats_update", threats_visible_to(role), to=request.sid)
        socketio.emit("aims_update", combat_aims, to=request.sid)
        socketio.emit("exchanges_update", list(pending_exchanges.values()), to=request.sid)
        if role == "master":
            socketio.emit("scene_list", get_scene_list(), to=request.sid)
            socketio.emit("undo_status", {
                "count": len(undo_stack),
                "label": undo_stack[-1]["label"] if undo_stack else None
            }, to=request.sid)
            socketio.emit("npc_template_list", get_npc_template_list(), to=request.sid)


@socketio.on("disconnect")
def handle_disconnect():
    master_sids.discard(request.sid)
    client_roles.pop(request.sid, None)
    client_character_ids.pop(request.sid, None)


@socketio.on("get_code_status")
def handle_get_code_status():
    """Il client controlla ogni tanto se il server o la pagina sono rimasti indietro."""
    return code_status()


@socketio.on("connect")
def handle_connect():
    # init_state viene inviato subito dopo register_session_role, così il server
    # sa se deve fornire dati completi (Master) o pubblici (Giocatore).
    draw_list = [d.to_dict() for d in DrawItem.query.all()]

    emit("combat_update", combat_state)
    emit("code_status", code_status())
    emit("init_drawings", draw_list) # Invia i nuovi disegni
    emit("compendio_data", load_compendio())
    emit("map_update", get_world_state())


@socketio.on("register_player")
def handle_register_player(data):
    char_id = data.get("char_id")
    name = clean_character_name(data.get("name", ""))
    if not char_id or not name: return
    char = db.session.get(Character, char_id)
    if not char or char.role != "player" or not controls_character(char): return

    existing = Character.query.filter(Character.name == name, Character.id != char_id).first()
    if existing: return

    char.name = name
    db.session.commit()
    emit_character_update(char)
