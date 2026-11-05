"""Pedine: limite di dimensione delle immagini e libreria di pedine degli NPC.
"""
from flask_socketio import emit
from venander.core import db, socketio
from venander.models import NpcTokenPreset
from venander.permissions import emit_combat_error, is_master_request


# Pedine: ogni immagine viaggia verso tutti i giocatori, quindi c'è un limite
TOKEN_MAX_BYTES = 5 * 1024 * 1024


def token_too_big(data_url):
    """True se l'immagine (data URL base64) supera i 5 MB una volta decodificata."""
    text = str(data_url or "")
    payload = text.split(",", 1)[1] if text.startswith("data:") and "," in text else text
    decoded_size = len(payload) * 3 // 4 - payload[-2:].count("=")
    return decoded_size > TOKEN_MAX_BYTES


TOKEN_TOO_BIG_MESSAGE = "La pedina è troppo grande: massimo 5 MB."


def get_npc_token_library():
    tokens = NpcTokenPreset.query.order_by(NpcTokenPreset.name).all()

    return [
        {
            "id": token.id,
            "name": token.name,
            "image_data": token.image_data
        }
        for token in tokens
    ]


@socketio.on("get_npc_tokens")
def handle_get_npc_tokens():
    emit("npc_token_library", get_npc_token_library())


@socketio.on("save_npc_token")
def handle_save_npc_token(data):
    if not is_master_request():
        return

    name = str(data.get("name", "")).strip()
    image_data = data.get("image_data", "")

    if not name or not image_data:
        return
    if token_too_big(image_data):
        emit_combat_error(TOKEN_TOO_BIG_MESSAGE)
        return

    token = NpcTokenPreset(
        name=name,
        image_data=image_data
    )

    db.session.add(token)
    db.session.commit()

    emit(
        "npc_token_library",
        get_npc_token_library(),
        broadcast=True
    )
