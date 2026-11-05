"""Permessi.

Il server non si fida del client: il Master può tutto, un giocatore agisce
solo sul personaggio con cui si è registrato.
"""
import html
from flask import request
from flask_socketio import emit
from venander.state import client_character_ids, master_sids


def is_master_request():
    return request.sid in master_sids


def controls_character(char):
    """True se chi invia l'evento può agire per questo personaggio."""
    if char is None:
        return False

    if is_master_request():
        return True

    return char.role == "player" and client_character_ids.get(request.sid) == char.id


def emit_combat_error(message):
    emit("dice_result", {"name": "SISTEMA", "message": f"⚠️ {html.escape(message)}", "is_master_roll": False}, to=request.sid)
