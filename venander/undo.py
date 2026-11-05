"""Annulla ultima azione (Master) e numeri fluttuanti.

Prima di ogni azione di gioco si fotografano combattimento e personaggi; se
l'azione cambia qualcosa la foto finisce in una pila. "Annulla" ripristina
l'ultima. Dal confronto prima/dopo escono anche i numeri fluttuanti sugli HP
che cambiano.
"""
import copy
import functools
from venander.core import db, socketio
from venander.models import Character, WorldState
from venander.serialization import emit_to_masters
from venander.state import (
    combat_aims,
    combat_state,
    combat_threats,
    pending_attacks,
    pending_combat_results,
    pending_exchanges,
    pending_explosions,
    pending_surface_prompts,
)


UNDO_LIMIT = 15

UNDO_CHAR_FIELDS = (
    "pos_x", "pos_y", "hp_current", "stamina_current", "conc_current",
    "pa_stats", "bonuses", "stats", "weapons", "backpack", "heal_rate", "loot", "xp"
)

undo_stack = []


def take_game_snapshot():
    return {
        "combat_state": copy.deepcopy(combat_state),
        "threats": copy.deepcopy(combat_threats),
        "aims": copy.deepcopy(combat_aims),
        "pending_attacks": copy.deepcopy(pending_attacks),
        "pending_results": copy.deepcopy(pending_combat_results),
        "surface_prompts": copy.deepcopy(pending_surface_prompts),
        "exchanges": copy.deepcopy(pending_exchanges),
        "explosions": copy.deepcopy(pending_explosions),
        "trinkets": copy.deepcopy(WorldState.query.first().trinkets or []),
        "characters": {
            c.id: {field: copy.deepcopy(getattr(c, field)) for field in UNDO_CHAR_FIELDS}
            for c in Character.query.all()
        }
    }


def emit_undo_status():
    emit_to_masters("undo_status", {
        "count": len(undo_stack),
        "label": undo_stack[-1]["label"] if undo_stack else None
    })


def float_text(char, text, kind):
    """Scritta che sale sopra la pedina: kind = damage | heal | info."""
    payload = {"char_id": char.id, "text": text, "kind": kind}
    # Un NPC nascosto non deve tradire la sua posizione ai giocatori
    if char.role == "npc" and (char.is_hidden or char.is_invisible):
        emit_to_masters("floating_text", payload)
    else:
        socketio.emit("floating_text", payload)


def float_hp_changes(before, after):
    for char_id, old in before["characters"].items():
        new = after["characters"].get(char_id)
        if not new or old["hp_current"] == new["hp_current"]:
            continue
        char = db.session.get(Character, char_id)
        diff = (new["hp_current"] or 0) - (old["hp_current"] or 0)
        float_text(char, f"{diff:+d}", "heal" if diff > 0 else "damage")


def undoable(label):
    """Rende annullabile un evento: la foto entra nella pila solo se cambia qualcosa."""
    def decorator(handler):
        @functools.wraps(handler)
        def wrapper(*args):
            before = take_game_snapshot()
            result = handler(*args)
            after = take_game_snapshot()

            if before != after:
                data = args[0] if args and isinstance(args[0], dict) else {}
                actor = db.session.get(Character, data.get("char_id") or data.get("attacker_id")) \
                    if (data.get("char_id") or data.get("attacker_id")) else None
                before["label"] = f"{label} di {actor.name}" if actor else label
                undo_stack.append(before)
                del undo_stack[:-UNDO_LIMIT]
                emit_undo_status()
                float_hp_changes(before, after)

            return result
        return wrapper
    return decorator
