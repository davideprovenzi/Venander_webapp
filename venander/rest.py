"""Riposo.

Breve: stamina, concentrazione e PA. Lungo (accampamento): anche fine degli
effetti a tempo e cura = tasso di cura x ore di riposo, decisi dal Master per
ogni giocatore. Solo per i personaggi giocanti.
"""
import html
import re
from flask import request
from sqlalchemy.orm.attributes import flag_modified
from venander.core import db, socketio
from venander.models import Character
from venander.permissions import emit_combat_error, is_master_request
from venander.serialization import emit_character_update, emit_to_character, emit_to_masters
from venander.state import client_character_ids, combat_state, long_rest_choices
from venander.undo import undoable
from venander.utils import format_number


def long_rest_heal(char, heal_data, bonus=0.0):
    """Applica la cura del riposo lungo e restituisce (hp recuperati, tasso, ore).

    Il bonus della fiala si somma al tasso solo per questo riposo.
    """
    try:
        rate = max(0.0, float((heal_data or {}).get("rate", char.heal_rate or 0)))
        hours = max(0.0, float((heal_data or {}).get("hours", 0)))
    except (TypeError, ValueError):
        rate, hours = float(char.heal_rate or 0), 0.0

    # Il tasso base resta sul personaggio per il prossimo riposo
    char.heal_rate = rate

    healed = min(int((rate + bonus) * hours), max(0, char.hp_max - char.hp_current))
    char.hp_current += healed
    return healed, rate, hours


# ------------------------------------------
# Fiale di cura: il giocatore sceglie se berne una (al massimo una per riposo)
# ------------------------------------------
HEAL_VIAL_NAME = re.compile(r"fiala|pozion", re.IGNORECASE)

HEAL_RATE_TEXT = re.compile(r"tasso\s+di\s+cura", re.IGNORECASE)

HEAL_BONUS_AFTER = re.compile(r"tasso\s+di\s+cura\D{0,15}?([+-]?\d+(?:[.,]\d+)?)", re.IGNORECASE)

HEAL_BONUS_BEFORE = re.compile(r"([+-]?\d+(?:[.,]\d+)?)\s*(?:al|di|sul)?\s*tasso\s+di\s+cura", re.IGNORECASE)


def parse_heal_bonus(text):
    """Bonus al tasso di cura scritto nella descrizione, es. "+2 al tasso di cura"."""
    text = str(text or "")
    match = HEAL_BONUS_BEFORE.search(text) or HEAL_BONUS_AFTER.search(text)
    if not match:
        return None
    return float(match.group(1).replace(",", "."))


def healing_vials(char):
    vials = []
    for index, item in enumerate(char.backpack or []):
        if not isinstance(item, dict) or int(item.get("qty", 1) or 0) <= 0:
            continue
        name, desc = str(item.get("name", "")), str(item.get("desc", ""))
        if HEAL_VIAL_NAME.search(name) or HEAL_RATE_TEXT.search(desc):
            vials.append({
                "index": index,
                "name": name,
                "qty": int(item.get("qty", 1) or 1),
                "bonus": parse_heal_bonus(desc)
            })
    return vials


def consume_backpack_item(char, index):
    backpack = [dict(item) if isinstance(item, dict) else item for item in (char.backpack or [])]
    item = backpack[index]
    qty = int(item.get("qty", 1) or 1) - 1
    if qty > 0:
        item["qty"] = qty
    else:
        backpack.pop(index)
    char.backpack = backpack
    flag_modified(char, "backpack")


@socketio.on("long_rest_start")
def handle_long_rest_start():
    """Il Master apre la finestra del riposo: chi ha fiale riceve la proposta."""
    if not is_master_request():
        return

    long_rest_choices.clear()
    status = {}

    for char in Character.query.filter_by(role="player").all():
        vials = healing_vials(char)
        if not vials:
            continue
        status[str(char.id)] = {"vials": vials, "answer": "pending"}
        emit_to_character(char.id, "long_rest_potion_offer", {"vials": vials})

    emit_to_masters("long_rest_status", status)


@socketio.on("long_rest_potion_choice")
def handle_long_rest_potion_choice(data):
    char = db.session.get(Character, client_character_ids.get(request.sid))
    if not char or char.role != "player":
        return

    vials = {vial["index"]: vial for vial in healing_vials(char)}
    index = (data or {}).get("index")

    if index is not None and index not in vials:
        return

    long_rest_choices[char.id] = index
    emit_to_masters("long_rest_potion_choice", {
        "char_id": char.id,
        "vial": vials.get(index)
    })


@socketio.on("long_rest_cancel")
def handle_long_rest_cancel():
    if not is_master_request():
        return

    long_rest_choices.clear()
    socketio.emit("long_rest_closed", {})


@socketio.on("party_rest")
@undoable("Riposo")
def handle_party_rest(data):
    if not is_master_request():
        return

    if combat_state.get("is_active"):
        emit_combat_error("Non si può riposare durante un combattimento.")
        return

    long_rest = (data or {}).get("kind") == "long"
    heals = (data or {}).get("heals") or {}
    heal_lines = []

    for char in Character.query.filter_by(role="player").all():
        char.stamina_current = char.stamina_max
        char.conc_current = char.conc_max
        # PA vuoti = valori pieni calcolati dalle statistiche
        char.pa_stats = {}

        if long_rest:
            heal_data = heals.get(str(char.id)) or {}

            # Fiala scelta dal giocatore: il bonus lo conferma il Master
            # (se la descrizione non lo dice lo scrive lui)
            vial = None
            index = long_rest_choices.get(char.id)
            if index is not None:
                vial = next((v for v in healing_vials(char) if v["index"] == index), None)

            bonus = 0.0
            if vial:
                try:
                    bonus = max(0.0, float(heal_data.get("potion_bonus", vial["bonus"] or 0)))
                except (TypeError, ValueError):
                    bonus = float(vial["bonus"] or 0)
                consume_backpack_item(char, index)

            healed, rate, hours = long_rest_heal(char, heal_data, bonus)
            rate_text = f"({format_number(rate)} + {format_number(bonus)} 🧪)" if vial else format_number(rate)
            heal_lines.append(
                f"{html.escape(char.name)}: <b>+{healed} HP</b> "
                f"({rate_text} × {format_number(hours)} h) → {char.hp_current}/{char.hp_max}"
                + (f" · beve <b>{html.escape(vial['name'])}</b>" if vial else "")
            )
            char.bonuses = [
                b for b in (char.bonuses or [])
                if not (isinstance(b, dict) and int(b.get("turns", 0) or 0) > 0)
            ]
            flag_modified(char, "bonuses")

    db.session.commit()

    if long_rest:
        long_rest_choices.clear()
        socketio.emit("long_rest_closed", {})

    for char in Character.query.filter_by(role="player").all():
        emit_character_update(char)

    message = (
        "🏕️ <b>RIPOSO LUNGO</b>: il gruppo si accampa. "
        "Stamina, concentrazione e PA tornano al massimo; gli effetti a tempo svaniscono."
        "<br>" + "<br>".join(heal_lines)
        if long_rest else
        "☕ <b>RIPOSO BREVE</b>: il gruppo riprende fiato. Stamina, concentrazione e PA tornano al massimo."
    )
    socketio.emit("dice_result", {"name": "SISTEMA", "message": message, "is_master_roll": True})
