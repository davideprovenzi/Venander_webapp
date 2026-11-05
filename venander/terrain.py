"""Terreno e superfici.

Il Master dipinge gli esagoni. Il terreno (altura, coperture) è indicativo e
lo applica il Master; muri e fumo bloccano la vista, i muri anche il
movimento; terreno difficile e ghiaccio costano doppio. Le superfici (fuoco,
acido...) chiedono una scelta a chi ci entra.
"""
import html
import uuid
from sqlalchemy.orm.attributes import flag_modified
from venander.core import db, socketio
from venander.hexes import hex_key, hex_line
from venander.models import Character, WorldState
from venander.permissions import is_master_request
from venander.serialization import emit_character_update, emit_to_masters
from venander.state import pending_surface_prompts
from venander.undo import undoable


# PA per scavalcare ogni esagono di mezza barricata (copertura parziale) in combattimento
BARRICADE_PA_COST = 5

TERRAIN_TYPES = {"altura", "copertura_parziale", "copertura_totale", "difficile", "muro"}

SURFACE_EFFECTS = {
    "fuoco": {
        "label": "Fuoco",
        "damage": 3,
        "effect": {"name": "In fiamme", "desc": "Brucia: -2 HP a turno", "turns": 2, "hpChange": -2}
    },
    "veleno": {
        "label": "Veleno",
        "damage": 0,
        "effect": {"name": "Avvelenato", "desc": "Veleno: -1 HP a turno", "turns": 3, "hpChange": -1}
    },
    "ghiaccio": {
        "label": "Ghiaccio",
        "damage": 0,
        "effect": {"name": "A terra", "desc": "Scivolato sul ghiaccio: deve rialzarsi", "turns": 1, "hpChange": 0}
    },
    # Il fumo non ferisce: blocca solo la vista
    "fumo": {"label": "Fumo", "damage": 0, "effect": None}
}


def wall_hexes(ws):
    return {h for h, kind in (ws.terrain or {}).items() if kind == "muro"}


def sight_blocking_hexes(ws):
    blocked = wall_hexes(ws)
    blocked |= {h for h, kind in (ws.surfaces or {}).items() if kind == "fumo"}
    return blocked


def has_line_of_sight(x1, y1, x2, y2, blocked):
    """Gli esagoni in mezzo non devono bloccare la vista (gli estremi sì che si vedono)."""
    return all(hex_key(hx, hy) not in blocked for hx, hy in hex_line(x1, y1, x2, y2)[1:-1])


def movement_frame_cost(ws, path, frames_per_step):
    cost = 0
    for hx, hy in path[1:]:
        key = hex_key(hx, hy)
        difficult = (ws.terrain or {}).get(key) == "difficile" or (ws.surfaces or {}).get(key) == "ghiaccio"
        cost += frames_per_step * (2 if difficult else 1)
    return cost


def prompt_surface_effect(char, surface, reason):
    prompt_id = str(uuid.uuid4())
    definition = SURFACE_EFFECTS[surface]
    prompt = {
        "id": prompt_id,
        "char_id": char.id,
        "char_name": char.name,
        "surface": surface,
        "label": definition["label"],
        "damage": definition["damage"],
        "effect": definition["effect"],
        "reason": reason
    }
    pending_surface_prompts[prompt_id] = prompt
    emit_to_masters("surface_prompt", prompt)


def prompt_turn_start_surface(char_id):
    char = db.session.get(Character, char_id) if char_id is not None else None
    if not char:
        return

    surface = (WorldState.query.first().surfaces or {}).get(hex_key(char.pos_x, char.pos_y))
    if surface in SURFACE_EFFECTS and SURFACE_EFFECTS[surface]["effect"]:
        prompt_surface_effect(char, surface, "turn")


@socketio.on("resolve_surface_prompt")
@undoable("Effetto della superficie")
def handle_resolve_surface_prompt(data):
    if not is_master_request():
        return

    data = data or {}
    prompt = pending_surface_prompts.pop(data.get("id"), None)
    if not prompt:
        return

    # Anche gli altri Master chiudono il popup
    emit_to_masters("surface_prompt_closed", {"id": prompt["id"]})

    if not data.get("apply"):
        return

    char = db.session.get(Character, prompt["char_id"])
    if not char:
        return

    damage = int(prompt["damage"] or 0)
    if damage:
        char.hp_current = max(0, char.hp_current - damage)

    effect = prompt["effect"]
    if effect:
        # L'effetto non si accumula: se c'è già, riparte da capo
        bonuses = [
            b for b in (char.bonuses or [])
            if not (isinstance(b, dict) and b.get("name") == effect["name"])
        ]
        bonuses.append(dict(effect))
        char.bonuses = bonuses
        flag_modified(char, "bonuses")

    db.session.commit()
    emit_character_update(char)

    parts = []
    if damage:
        parts.append(f"<b>{damage} danni</b>")
    if effect:
        parts.append(f"<b>{html.escape(effect['name'])}</b> ({effect['turns']} turni)")

    socketio.emit("dice_result", {
        "name": char.name,
        "message": f"subisce la superficie <b>{html.escape(prompt['label'])}</b>: {', '.join(parts)}.",
        "is_master_roll": False
    })
