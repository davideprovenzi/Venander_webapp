"""Abilità dei gadget.

Un gadget comprato mostra la sua abilità nella scheda; si usa quando è
equipaggiato (o subito, se non ha uno slot). Usarla la annuncia in chat e
spende i PA scritti nel compendio.
"""
import html
from flask import request
from flask_socketio import emit
from venander.compendium import char_owned_items, get_compendium_item
from venander.core import db, socketio
from venander.models import Character
from venander.permissions import controls_character
from venander.serialization import emit_character_update
from venander.stats import stat_pa_current
from venander.undo import undoable


GADGET_EXCLUDED_CLASSES = {"Arma", "Licenza", "Kit", "Munizione / consumabile", "Armatura"}

# Codici di costo del compendio -> statistica di cui si spendono i PA ("PA" la sceglie il giocatore)
GADGET_PA_STATS = {"PAA": "Arguzia", "PAV": "Volontà", "PAP": "Percezione"}


def gadget_effect_text(item):
    text = ((item.get("text") or {}).get("effect_summary") or "").strip()
    if text:
        return text
    effects = item.get("effects") or {}
    return "; ".join(str(v) for v in effects.values() if v)


@socketio.on("use_gadget_ability")
@undoable("Uso del gadget")
def handle_use_gadget_ability(data):
    data = data or {}
    char = db.session.get(Character, data.get("char_id"))
    if not controls_character(char):
        return

    def refuse(message):
        emit("dice_result", {"name": "SISTEMA", "message": f"⚠️ {html.escape(message)}", "is_master_roll": False}, to=request.sid)

    item = get_compendium_item(compendium_id=data.get("compendium_id"))
    if not item or item.get("class") in GADGET_EXCLUDED_CLASSES:
        refuse("Gadget non trovato.")
        return

    backpack, equipped = char_owned_items(char)
    is_equipped = any(entry.get("compendium_id") == item["id"] for entry in equipped)
    owned = is_equipped or any(entry.get("compendium_id") == item["id"] for entry in backpack)
    needs_slot = bool(((item.get("equipment") or {}).get("slot") or {}).get("allowed_slots"))

    if not owned:
        refuse("Non possiedi questo gadget.")
        return
    if needs_slot and not is_equipped:
        refuse(f"Equipaggia {item['name']} per usarne l'abilità.")
        return

    activation = item.get("activation") or {}
    mode = str(activation.get("mode") or "")
    if mode.startswith("Passivo") and "attiva" not in mode:
        refuse("È un'abilità passiva: è sempre attiva quando il gadget è equipaggiato.")
        return

    # Costi: numeri fissi dal compendio; per quelli descritti a parole
    # (es. "2 per metro") il giocatore dice quanto spende
    spend = {}
    for code, raw in (activation.get("cost") or {}).items():
        if code == "maintenance" or raw in (None, ""):
            continue

        stat = GADGET_PA_STATS.get(code) or (data.get("pa_stat") if code == "PA" else None)
        if not stat or stat not in (char.stats or {}):
            refuse("Scegli la statistica da cui spendere i PA.")
            return

        if isinstance(raw, (int, float)) or str(raw).strip().isdigit():
            amount = int(float(raw))
        else:
            try:
                amount = max(0, int((data.get("amounts") or {}).get(code)))
            except (TypeError, ValueError):
                refuse(f"Indica quanti PA spendere ({raw}).")
                return

        spend[stat] = spend.get(stat, 0) + amount

    for stat, amount in spend.items():
        if stat_pa_current(char, stat) < amount:
            refuse(f"PA insufficienti in {stat}: servono {amount}, ne hai {stat_pa_current(char, stat)}.")
            return

    if spend:
        pa_stats = dict(char.pa_stats or {})
        for stat, amount in spend.items():
            pa_stats[stat] = stat_pa_current(char, stat) - amount
        char.pa_stats = pa_stats
        db.session.commit()
        emit_character_update(char)

    cost_text = ", ".join(f"{amount} PA {stat}" for stat, amount in spend.items() if amount)
    effect = gadget_effect_text(item)

    emit("dice_result", {
        "name": char.name,
        "message": (
            f"usa <b>{html.escape(item['name'])}</b>"
            + (f": {html.escape(effect)}" if effect else "")
            + (f" <i>(spende {html.escape(cost_text)})</i>" if cost_text else "")
        ).replace("\n", "<br>"),
        "is_master_roll": False
    }, broadcast=True)
