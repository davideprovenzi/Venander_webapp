"""Suoni degli NPC.

Il Master registra (o carica) un suono per un modello NPC: si sente quando un
NPC di quel modello compare agli occhi dei giocatori. I file stanno in
instance/sounds.
"""
import base64
import os
import re
import uuid
from flask import abort, send_from_directory
from venander.core import app


SOUND_DIR = os.path.join(app.instance_path, "sounds")

SOUND_MAX_BYTES = 1_000_000

SOUND_TYPES = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp3": "mp3",
               "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac"}

SOUND_FILE_PATTERN = re.compile(r"^[0-9a-f]{32}\.(webm|ogg|mp3|wav|m4a|aac)$")


@app.route("/sounds/<name>")
def serve_sound(name):
    if not SOUND_FILE_PATTERN.match(name):
        abort(404)
    return send_from_directory(SOUND_DIR, name, max_age=86400)


def save_sound_data_url(data_url):
    """data:audio/...;base64,... -> URL del file salvato (o un messaggio d'errore)."""
    match = re.match(r"^data:([\w/+.-]+)(?:;[^,]*)?;base64,(.*)$", str(data_url or ""), re.S)
    if not match:
        return None, "Formato del suono non valido."
    mime = match.group(1).lower()
    ext = SOUND_TYPES.get(mime)
    if not ext:
        return None, f"Tipo di file non supportato ({mime}): usa mp3, ogg, wav, webm o m4a."
    try:
        raw = base64.b64decode(match.group(2), validate=False)
    except (ValueError, TypeError):
        return None, "Il file del suono è danneggiato."
    if not raw or len(raw) > SOUND_MAX_BYTES:
        return None, f"Il suono deve pesare al massimo {SOUND_MAX_BYTES // 1000} KB."
    os.makedirs(SOUND_DIR, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{ext}"
    with open(os.path.join(SOUND_DIR, name), "wb") as handle:
        handle.write(raw)
    return f"/sounds/{name}", None
