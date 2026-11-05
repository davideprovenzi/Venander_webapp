"""Scene.

Ogni scena conserva mappa, disegni e nebbia. Cambiando scena quella aperta
viene salvata in automatico, come delle schede. Le pedine restano dove sono:
il gruppo viaggia con il Master.
"""
import html
from venander.core import db, socketio
from venander.models import DrawItem, Scene, WorldState
from venander.permissions import is_master_request
from venander.serialization import emit_to_masters, get_world_state
from venander.trinkets import emit_trinkets


def get_scene_list():
    ws = WorldState.query.first()
    return {
        "active_id": ws.active_scene_id if ws else None,
        "scenes": [
            {"id": scene.id, "name": scene.name}
            for scene in Scene.query.order_by(Scene.id).all()
        ]
    }


def emit_scene_list():
    emit_to_masters("scene_list", get_scene_list())


def snapshot_world_into(scene):
    ws = WorldState.query.first()
    scene.map_url = ws.map_url or ""
    scene.map_scale = ws.map_scale
    scene.map_dx = ws.map_dx
    scene.map_dy = ws.map_dy
    scene.fow_enabled = bool(ws.fow_enabled)
    scene.revealed_hexes = list(ws.revealed_hexes or [])
    scene.drawings = [item.to_dict() for item in DrawItem.query.all()]
    scene.terrain = dict(ws.terrain or {})
    scene.surfaces = dict(ws.surfaces or {})
    scene.trinkets = list(ws.trinkets or [])


def save_active_scene():
    ws = WorldState.query.first()
    active = db.session.get(Scene, ws.active_scene_id) if ws.active_scene_id else None
    if active:
        snapshot_world_into(active)


def apply_scene(scene):
    ws = WorldState.query.first()
    ws.map_url = scene.map_url or ""
    ws.map_scale = scene.map_scale or 1.0
    ws.map_dx = scene.map_dx or 0
    ws.map_dy = scene.map_dy or 0
    ws.fow_enabled = bool(scene.fow_enabled)
    ws.revealed_hexes = list(scene.revealed_hexes or [])
    ws.terrain = dict(scene.terrain or {})
    ws.surfaces = dict(scene.surfaces or {})
    ws.trinkets = list(scene.trinkets or [])
    ws.active_scene_id = scene.id

    DrawItem.query.delete()
    for item in scene.drawings or []:
        db.session.add(DrawItem(
            uid=item["uid"],
            type=item.get("type", "line"),
            sx=item.get("sx", 0),
            sy=item.get("sy", 0),
            ex=item.get("ex", 0),
            ey=item.get("ey", 0),
            color=item.get("c", "#000000"),
            size=item.get("w", 3),
            img_data=item.get("img"),
            points=item.get("points")
        ))


def broadcast_world_after_scene_change():
    socketio.emit("map_update", get_world_state())
    emit_trinkets()
    socketio.emit("init_drawings", [item.to_dict() for item in DrawItem.query.all()])
    emit_scene_list()


def clean_scene_name(value):
    return str(value or "").strip()[:100]


@socketio.on("scene_create")
def handle_scene_create(data):
    if not is_master_request():
        return

    data = data or {}
    name = clean_scene_name(data.get("name"))
    if not name:
        return

    save_active_scene()

    scene = Scene(name=name)
    db.session.add(scene)

    if data.get("empty"):
        # Scena vuota: si parte da una mappa pulita
        scene.drawings = []
        scene.revealed_hexes = []
        scene.terrain = {}
        scene.surfaces = {}
        scene.trinkets = []
        db.session.flush()
        apply_scene(scene)
    else:
        # Salva quello che c'è adesso come nuova scena
        snapshot_world_into(scene)
        db.session.flush()
        WorldState.query.first().active_scene_id = scene.id

    db.session.commit()
    broadcast_world_after_scene_change()


@socketio.on("scene_load")
def handle_scene_load(data):
    if not is_master_request():
        return

    scene = db.session.get(Scene, (data or {}).get("id"))
    if not scene:
        return

    save_active_scene()
    apply_scene(scene)
    db.session.commit()
    broadcast_world_after_scene_change()

    socketio.emit("dice_result", {
        "name": "SISTEMA",
        "message": f"🎬 Cambio scena: <b>{html.escape(scene.name)}</b>",
        "is_master_roll": False
    })


@socketio.on("scene_rename")
def handle_scene_rename(data):
    if not is_master_request():
        return

    data = data or {}
    scene = db.session.get(Scene, data.get("id"))
    name = clean_scene_name(data.get("name"))
    if not scene or not name:
        return

    scene.name = name
    db.session.commit()
    emit_scene_list()


@socketio.on("scene_delete")
def handle_scene_delete(data):
    if not is_master_request():
        return

    scene = db.session.get(Scene, (data or {}).get("id"))
    if not scene:
        return

    # La mappa attuale resta com'è, semplicemente non è più legata a una scena
    ws = WorldState.query.first()
    if ws.active_scene_id == scene.id:
        ws.active_scene_id = None

    db.session.delete(scene)
    db.session.commit()
    emit_scene_list()
