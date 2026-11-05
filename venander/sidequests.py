"""Sidequest.

Il Master le pubblica per tutti o per un solo giocatore; i giocatori le
pagano (ognuno il costo intero, spesa comune o quote decise dal Master) e
possono ricevere un'arma della Fucina come ricompensa.
"""
import html
from flask import request
from flask_socketio import emit
from sqlalchemy.orm.attributes import flag_modified
from venander.core import db, socketio
from venander.forge import build_forged_weapon, forged_weapon_inventory_entry
from venander.models import Character, SideQuest
from venander.serialization import emit_character_update
from venander.state import client_character_ids, client_roles, master_sids


SIDEQUEST_PAYMENT_MODES = {"each", "shared", "assigned"}


def sidequest_amounts(raw):
    """{"char_id": euro} pulito, con chiavi stringa (come arrivano dal JSON)."""
    amounts = {}
    for raw_id, raw_amount in (raw or {}).items():
        try:
            char_id, amount = int(raw_id), int(raw_amount)
        except (TypeError, ValueError):
            continue
        if amount > 0:
            amounts[str(char_id)] = amount
    return amounts


def serialize_sidequest(quest):
    target_name = "Tutti i giocatori"
    if quest.target_char_id is not None:
        target = db.session.get(Character, quest.target_char_id)
        target_name = target.name if target else f"Giocatore #{quest.target_char_id}"

    paid_by = []
    for raw_id in (quest.paid_by or []):
        try:
            paid_by.append(int(raw_id))
        except (TypeError, ValueError):
            continue

    contributions = sidequest_amounts(quest.contributions)
    collected = sum(contributions.values())

    return {
        "id": quest.id,
        "title": quest.title,
        "description": quest.description or "",
        "cost": max(0, int(quest.cost or 0)),
        "payment_mode": quest.payment_mode or "each",
        "shares": sidequest_amounts(quest.shares),
        "contributions": contributions,
        "collected": collected,
        "remaining": max(0, int(quest.cost or 0) - collected),
        "target_char_id": quest.target_char_id,
        "target_name": target_name,
        "paid_by": paid_by,
        "reward_weapon": quest.reward_weapon if isinstance(quest.reward_weapon, dict) else None,
        "reward_delivered_to": [
            int(raw_id)
            for raw_id in (quest.reward_delivered_to or [])
            if str(raw_id).lstrip("-").isdigit()
        ],
        "active": bool(quest.active)
    }


def sidequest_visible_to(quest, role, char_id):
    if role == "master":
        return True
    if role != "player" or not char_id:
        return False
    return quest.target_char_id is None or int(quest.target_char_id) == int(char_id)


def emit_sidequest_list_to_sid(sid, role, char_id):
    quests = SideQuest.query.filter_by(active=True).order_by(SideQuest.id.asc()).all()
    visible = [
        serialize_sidequest(quest)
        for quest in quests
        if sidequest_visible_to(quest, role, char_id)
    ]
    socketio.emit("sidequest_list", visible, to=sid)


def emit_sidequest_to_viewers(event_name, quest):
    payload = serialize_sidequest(quest)

    # Una sidequest destinata a tutti viene inviata direttamente a tutti
    # i client connessi. Non dipende quindi dalla registrazione del ruolo.
    if quest.target_char_id is None:
        socketio.emit(event_name, payload)
        return

    # Sidequest personale: il Master la vede sempre.
    sent_to = set()

    for sid in list(master_sids):
        socketio.emit(event_name, payload, to=sid)
        sent_to.add(sid)

    # La vede anche il personaggio destinatario.
    for sid, char_id in list(client_character_ids.items()):
        if sid in sent_to or char_id is None:
            continue

        try:
            matches = int(char_id) == int(quest.target_char_id)
        except (TypeError, ValueError):
            matches = False

        if matches:
            socketio.emit(event_name, payload, to=sid)


def emit_to_sidequest_viewers(event_name, payload, quest):
    # Per una quest globale il relativo evento è globale.
    if quest.target_char_id is None:
        socketio.emit(event_name, payload)
        return

    sent_to = set()

    for sid in list(master_sids):
        socketio.emit(event_name, payload, to=sid)
        sent_to.add(sid)

    for sid, char_id in list(client_character_ids.items()):
        if sid in sent_to or char_id is None:
            continue

        try:
            matches = int(char_id) == int(quest.target_char_id)
        except (TypeError, ValueError):
            matches = False

        if matches:
            socketio.emit(event_name, payload, to=sid)


@socketio.on("create_sidequest")
def handle_create_sidequest(data):
    if request.sid not in master_sids:
        return

    data = data or {}
    title = str(data.get("title", "")).strip()[:160]
    description = str(data.get("description", "")).strip()[:3000]

    if not title:
        emit("sidequest_error", {"message": "Inserisci un titolo per la sidequest."}, to=request.sid)
        return

    try:
        cost = max(0, int(data.get("cost", 0)))
    except (TypeError, ValueError):
        emit("sidequest_error", {"message": "Il costo della sidequest non è valido."}, to=request.sid)
        return

    target_char_id = None
    raw_target = data.get("target_char_id")
    if raw_target not in (None, "", "all", 0, "0"):
        try:
            candidate = int(raw_target)
        except (TypeError, ValueError):
            candidate = None

        target = db.session.get(Character, candidate) if candidate else None
        if not target or target.role != "player":
            emit("sidequest_error", {"message": "Destinatario non valido."}, to=request.sid)
            return
        target_char_id = target.id

    raw_reward_weapon = data.get("reward_weapon")
    reward_weapon = None
    if raw_reward_weapon:
        reward_weapon = build_forged_weapon(raw_reward_weapon)
        if not reward_weapon:
            emit(
                "sidequest_error",
                {"message": "Arma forgiata non valida: controlla nome e velocità d'attacco."},
                to=request.sid
            )
            return

    # Le modalità divise hanno senso solo per una sidequest di tutti
    payment_mode = str(data.get("payment_mode") or "each")
    if payment_mode not in SIDEQUEST_PAYMENT_MODES or target_char_id is not None:
        payment_mode = "each"

    shares = {}
    if payment_mode == "assigned":
        for raw_id, raw_amount in (data.get("shares") or {}).items():
            player = db.session.get(Character, raw_id)
            try:
                amount = max(0, int(raw_amount))
            except (TypeError, ValueError):
                amount = 0
            if player and player.role == "player" and amount:
                shares[str(player.id)] = amount

        if not shares:
            emit("sidequest_error", {"message": "Assegna una quota ad almeno un giocatore."}, to=request.sid)
            return

        # Il totale è la somma delle quote
        cost = sum(shares.values())

    quest = SideQuest(
        title=title,
        description=description,
        cost=cost,
        target_char_id=target_char_id,
        payment_mode=payment_mode,
        shares=shares,
        contributions={},
        paid_by=[],
        reward_weapon=reward_weapon,
        reward_delivered_to=[],
        active=True
    )
    db.session.add(quest)
    db.session.commit()

    emit_sidequest_to_viewers("sidequest_created", quest)


@socketio.on("pay_sidequest")
def handle_pay_sidequest(data):
    if client_roles.get(request.sid) != "player":
        return

    char_id = client_character_ids.get(request.sid)
    char = db.session.get(Character, char_id) if char_id else None
    quest = db.session.get(SideQuest, (data or {}).get("quest_id"))

    if not char or char.role != "player":
        emit("sidequest_error", {"message": "Personaggio non valido."}, to=request.sid)
        return

    if not quest or not quest.active or not sidequest_visible_to(quest, "player", char.id):
        emit("sidequest_error", {"message": "Questa sidequest non è disponibile."}, to=request.sid)
        return

    paid_by = []
    for raw_id in (quest.paid_by or []):
        try:
            paid_by.append(int(raw_id))
        except (TypeError, ValueError):
            continue

    payment_mode = quest.payment_mode or "each"
    contributions = sidequest_amounts(quest.contributions)
    remaining_after = None

    if payment_mode == "shared":
        # Spesa comune: si versa quanto si vuole, fino a coprire il totale
        remaining = max(0, int(quest.cost or 0) - sum(contributions.values()))
        if remaining == 0:
            emit("sidequest_error", {"message": "La spesa è già stata coperta."}, to=request.sid)
            return
        try:
            cost = int((data or {}).get("amount"))
        except (TypeError, ValueError):
            cost = 0
        if cost < 1 or cost > remaining:
            emit("sidequest_error", {"message": f"Puoi versare da 1 a {remaining} €."}, to=request.sid)
            return
        remaining_after = remaining - cost
    else:
        if char.id in paid_by:
            emit("sidequest_error", {"message": "Hai già pagato questa sidequest."}, to=request.sid)
            return

        if payment_mode == "assigned":
            cost = sidequest_amounts(quest.shares).get(str(char.id), 0)
            if not cost:
                emit("sidequest_error", {"message": "Il Master non ti ha assegnato una quota."}, to=request.sid)
                return
        else:
            cost = max(0, int(quest.cost or 0))

    if int(char.xp or 0) < cost:
        emit(
            "sidequest_error",
            {"message": f"Fondi insufficienti: servono {cost} €, ma sul conto hai {int(char.xp or 0)} €."},
            to=request.sid
        )
        return

    char.xp = int(char.xp or 0) - cost
    if char.id not in paid_by:
        paid_by.append(char.id)
    quest.paid_by = paid_by
    contributions[str(char.id)] = contributions.get(str(char.id), 0) + cost
    quest.contributions = contributions
    db.session.commit()

    emit_character_update(char)
    emit_sidequest_to_viewers("sidequest_update", quest)

    payment_message = {
        "name": "📜 SIDEQUEST",
        "message": (
            f"<b>{html.escape(char.name)}</b> ha pagato <b>{cost} €</b> "
            f"per <b>{html.escape(quest.title)}</b>."
            + (
                f" Mancano <b>{remaining_after} €</b>." if remaining_after
                else " ✅ Spesa coperta!" if remaining_after == 0
                else ""
            )
        ),
        "is_master": False,
        "is_system": True
    }
    emit_to_sidequest_viewers("chat_message", payment_message, quest)


@socketio.on("deliver_sidequest_weapon")
def handle_deliver_sidequest_weapon(data):
    if request.sid not in master_sids:
        return

    data = data or {}
    quest = db.session.get(SideQuest, data.get("quest_id"))
    if not quest or not quest.active:
        emit("sidequest_error", {"message": "Task non disponibile."}, to=request.sid)
        return

    if not isinstance(quest.reward_weapon, dict):
        emit("sidequest_error", {"message": "Questa task non contiene un'arma forgiata."}, to=request.sid)
        return

    try:
        recipient_id = int(data.get("char_id"))
    except (TypeError, ValueError):
        recipient_id = None

    recipient = db.session.get(Character, recipient_id) if recipient_id else None
    if not recipient or recipient.role != "player":
        emit("sidequest_error", {"message": "Destinatario della ricompensa non valido."}, to=request.sid)
        return

    if quest.target_char_id is not None and int(quest.target_char_id) != int(recipient.id):
        emit("sidequest_error", {"message": "Questa task è assegnata a un altro personaggio."}, to=request.sid)
        return

    delivered = []
    for raw_id in (quest.reward_delivered_to or []):
        try:
            delivered.append(int(raw_id))
        except (TypeError, ValueError):
            continue

    if recipient.id in delivered:
        emit("sidequest_error", {"message": f"{recipient.name} ha già ricevuto questa arma."}, to=request.sid)
        return

    inventory_entry = forged_weapon_inventory_entry(quest.reward_weapon, quest.id)
    weapons = list(recipient.weapons or [])
    weapons.append(inventory_entry)
    recipient.weapons = weapons

    delivered.append(recipient.id)
    quest.reward_delivered_to = delivered
    flag_modified(quest, "reward_delivered_to")
    db.session.commit()

    emit_character_update(recipient)
    emit_sidequest_to_viewers("sidequest_update", quest)

    reward_name = html.escape(str(quest.reward_weapon.get("name", "Arma forgiata")))
    reward_message = {
        "name": "🔨 FORGIA",
        "message": (
            f"Il Master consegna <b>{reward_name}</b> a "
            f"<b>{html.escape(recipient.name)}</b> come ricompensa per "
            f"<b>{html.escape(quest.title)}</b>."
        ),
        "is_master": True,
        "is_system": True
    }
    emit_to_sidequest_viewers("chat_message", reward_message, quest)


@socketio.on("close_sidequest")
def handle_close_sidequest(data):
    if request.sid not in master_sids:
        return

    quest = db.session.get(SideQuest, (data or {}).get("quest_id"))
    if not quest or not quest.active:
        return

    # Prima notifichiamo i client che al momento possono vederla.
    payload = {"id": quest.id}
    emit_to_sidequest_viewers("sidequest_removed", payload, quest)

    quest.active = False
    db.session.commit()
