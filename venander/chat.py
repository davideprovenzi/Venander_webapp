"""Chat e dadi.
"""
import html
import random
import re
from flask import request
from flask_socketio import emit
from venander.core import db, socketio
from venander.models import Character
from venander.permissions import controls_character, is_master_request
from venander.state import client_character_ids, client_roles, master_sids


@socketio.on("roll_dice")
def handle_roll_dice(data):
    char = db.session.get(Character, data.get("char_id")) if data.get("char_id") else None
    # Nessuno può tirare a nome di un personaggio altrui
    if char and not controls_character(char):
        char = None
    dice_expr = str(data.get("dice", "1d20")).lower().strip()[:20]
    is_master = is_master_request()

    name = html.escape(char.name) if char else "Sconosciuto"
    if is_master: name = f"👑 [MASTER] {name}"

    match = re.match(r"^(\d*)d(\d+)$", dice_expr)
    if match:
        num = min(int(match.group(1)) if match.group(1) else 1, 100)
        sides = min(int(match.group(2)), 1000)
        rolls = [random.randint(1, sides) for _ in range(num)]
        total = sum(rolls)
        detail = f" <span style='font-size:11px; color:#7f8c8d;'>({'+'.join(map(str, rolls))})</span>" if num > 1 else ""
        msg = f"ha tirato {num}d{sides}: <strong style='font-size:16px; color:#2c3e50;'>{total}</strong>{detail}"
    else:
        msg = f"ha provato a tirare '<i>{html.escape(dice_expr)}</i>', ma non è un formato valido."

    result_data = {"name": name, "message": msg, "is_master_roll": is_master}
    emit("dice_result", result_data, to=request.sid if is_master else None, broadcast=not is_master)


@socketio.on("chat_message")
def handle_chat_message(data):
    data = data or {}

    raw_message = str(data.get("message", "")).strip()
    if not raw_message:
        return

    raw_message = raw_message[:1200]

    role = client_roles.get(request.sid, "player")
    sender_char_id = client_character_ids.get(request.sid)

    if role == "master":
        sender_name = "👑 MASTER"
        sender_plain_name = "MASTER"
        is_master_message = True
    else:
        sender_char = db.session.get(Character, sender_char_id) if sender_char_id else None
        if not sender_char or sender_char.role != "player":
            emit(
                "chat_error",
                {"message": "Seleziona prima il tuo personaggio."},
                to=request.sid
            )
            return

        sender_name = html.escape(sender_char.name)
        sender_plain_name = sender_char.name
        is_master_message = False

    safe_message = html.escape(raw_message).replace("\n", "<br>")
    target = str(data.get("target", "all") or "all").strip().lower()

    # ======================================
    # CHAT GLOBALE
    # ======================================
    if target == "all":
        socketio.emit(
            "chat_message",
            {
                "name": sender_name,
                "message": safe_message,
                "is_master": is_master_message,
                "is_system": False,
                "channel": "global",
                "is_private": False,
                "target_label": "Tutti"
            }
        )
        return

    # ======================================
    # PRIVATO CON IL MASTER
    # ======================================
    if target == "master":
        if role == "master":
            emit(
                "chat_error",
                {"message": "Seleziona un giocatore come destinatario."},
                to=request.sid
            )
            return

        payload = {
            "name": sender_name,
            "message": safe_message,
            "is_master": False,
            "is_system": False,
            "channel": "private",
            "is_private": True,
            "target_label": "Master",
            "private_route": f"{html.escape(sender_plain_name)} → 👑 Master"
        }

        recipient_sids = set(master_sids)

        # Il mittente vede il proprio messaggio su tutte le sue sessioni.
        for sid, char_id in list(client_character_ids.items()):
            if char_id is not None and int(char_id) == int(sender_char_id):
                recipient_sids.add(sid)

        recipient_sids.add(request.sid)

        for sid in recipient_sids:
            socketio.emit("chat_message", payload, to=sid)

        return

    # ======================================
    # PRIVATO VERSO UN GIOCATORE
    # target = player:<id>
    # ======================================
    if target.startswith("player:"):
        try:
            target_char_id = int(target.split(":", 1)[1])
        except (TypeError, ValueError, IndexError):
            emit(
                "chat_error",
                {"message": "Destinatario non valido."},
                to=request.sid
            )
            return

        target_char = db.session.get(Character, target_char_id)
        if not target_char or target_char.role != "player":
            emit(
                "chat_error",
                {"message": "Destinatario non valido."},
                to=request.sid
            )
            return

        # Un giocatore non ha bisogno di scrivere in privato a sé stesso.
        if role == "player" and int(sender_char_id) == int(target_char_id):
            emit(
                "chat_error",
                {"message": "Seleziona un altro destinatario."},
                to=request.sid
            )
            return

        target_name = html.escape(target_char.name)

        payload = {
            "name": sender_name,
            "message": safe_message,
            "is_master": is_master_message,
            "is_system": False,
            "channel": "private",
            "is_private": True,
            "target_label": target_name,
            "private_route": (
                f"👑 Master → {target_name}"
                if role == "master"
                else f"{html.escape(sender_plain_name)} → {target_name}"
            )
        }

        recipient_sids = set()

        # Destinatario.
        for sid, char_id in list(client_character_ids.items()):
            if char_id is not None and int(char_id) == int(target_char_id):
                recipient_sids.add(sid)

        if role == "master":
            # Chat Master ↔ giocatore: la vedono il Master e il giocatore.
            recipient_sids.update(master_sids)
            recipient_sids.add(request.sid)
        else:
            # Chat giocatore ↔ giocatore: davvero privata.
            # Il Master NON riceve il messaggio.
            for sid, char_id in list(client_character_ids.items()):
                if char_id is not None and int(char_id) == int(sender_char_id):
                    recipient_sids.add(sid)
            recipient_sids.add(request.sid)

        for sid in recipient_sids:
            socketio.emit("chat_message", payload, to=sid)

        return

    emit(
        "chat_error",
        {"message": "Destinatario chat non riconosciuto."},
        to=request.sid
    )
