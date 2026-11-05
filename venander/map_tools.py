"""Strumenti del Master sulla mappa: immagine di sfondo, nebbia di guerra, pittura del terreno.
"""
import re
from flask import request
from flask_socketio import emit
from venander.aiming import check_aims
from venander.core import db, socketio
from venander.hexes import hex_distance
from venander.models import Character, WorldState
from venander.movement import VISION_RADIUS
from venander.permissions import is_master_request
from venander.serialization import get_world_state
from venander.state import client_character_ids
from venander.terrain import SURFACE_EFFECTS, TERRAIN_TYPES, has_line_of_sight, sight_blocking_hexes


@socketio.on("paint_terrain")
def handle_paint_terrain(data):
    if not is_master_request():
        return

    data = data or {}
    layer = data.get("layer")
    value = data.get("value") or None
    allowed = TERRAIN_TYPES if layer == "terrain" else set(SURFACE_EFFECTS) if layer == "surface" else None

    if allowed is None or (value is not None and value not in allowed):
        return

    hexes = [str(h) for h in data.get("hexes", []) if re.match(r"^-?\d+,-?\d+$", str(h))]
    if not hexes:
        return

    ws = WorldState.query.first()
    column = "terrain" if layer == "terrain" else "surfaces"
    current = dict(getattr(ws, column) or {})

    for key in hexes:
        if value is None:
            current.pop(key, None)
        else:
            current[key] = value

    setattr(ws, column, current)
    db.session.commit()

    socketio.emit("terrain_update", {"layer": layer, "changes": {key: value for key in hexes}})

    # Un muro o del fumo nuovi possono chiudere una linea di vista
    check_aims()


@socketio.on("clear_terrain")
def handle_clear_terrain(data):
    if not is_master_request():
        return

    layer = (data or {}).get("layer")
    if layer not in ("terrain", "surface"):
        return

    ws = WorldState.query.first()
    setattr(ws, "terrain" if layer == "terrain" else "surfaces", {})
    db.session.commit()
    socketio.emit("map_update", get_world_state())


@socketio.on("set_map")
def handle_set_map(data):
    if not is_master_request():
        return

    ws = WorldState.query.first()
    ws.map_url = data.get("url", ws.map_url)
    ws.map_scale = float(data.get("scale", ws.map_scale))
    ws.map_dx = int(data.get("dx", ws.map_dx))
    ws.map_dy = int(data.get("dy", ws.map_dy))
    db.session.commit()
    emit("map_update", get_world_state(), broadcast=True)


@socketio.on("toggle_global_fow")
def handle_toggle_global_fow(data):
    if not is_master_request():
        return

    ws = WorldState.query.first()
    ws.fow_enabled = data.get("enabled", False)
    db.session.commit()
    emit("map_update", get_world_state(), broadcast=True)


@socketio.on("reset_fow")
def handle_reset_fow():
    if not is_master_request():
        return

    ws = WorldState.query.first()
    ws.revealed_hexes = []
    db.session.commit()
    emit("map_update", get_world_state(), broadcast=True)


@socketio.on("reveal_hexes")
def handle_reveal_hexes(data):
    ws = WorldState.query.first()
    new_hexes = [str(h) for h in (data or {}).get("hexes", [])]

    if not is_master_request():
        char = db.session.get(Character, client_character_ids.get(request.sid))
        if not char:
            return

        # Solo le caselle entro il raggio visivo del proprio personaggio
        def in_vision(hex_str):
            try:
                col, row = (int(v) for v in hex_str.split(","))
            except ValueError:
                return False
            return (
                hex_distance(char.pos_x, char.pos_y, col, row) <= VISION_RADIUS
                and has_line_of_sight(char.pos_x, char.pos_y, col, row, blocked)
            )

        blocked = sight_blocking_hexes(ws)
        new_hexes = [h for h in new_hexes if in_vision(h)]

    current_set = set(ws.revealed_hexes)
    current_set.update(new_hexes)
    ws.revealed_hexes = list(current_set)
    db.session.commit()
    emit("map_update", get_world_state(), broadcast=True)


@socketio.on("sync_fow_hexes")
def handle_sync_fow(hex_list):
    if not is_master_request():
        return

    ws = WorldState.query.first()
    ws.revealed_hexes = hex_list
    db.session.commit()
    emit("update_fow_hexes", hex_list, broadcast=True)
