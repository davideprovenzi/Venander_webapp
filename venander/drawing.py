"""Disegni sulla mappa: ping, puntatore laser, forme e sticker.
"""
from flask import request
from flask_socketio import emit
from uuid import uuid4
from venander.core import db, socketio
from venander.models import DrawItem, Line
from venander.state import master_sids


@socketio.on("clear_drawings")
def handle_clear_drawings():
    if request.sid not in master_sids:
        return

    db.session.query(DrawItem).delete()
    db.session.query(Line).delete() # Puliamo anche le vecchie linee per sicurezza
    db.session.commit()
    emit("clear_lines", broadcast=True)


@socketio.on("delete_drawings")
def handle_delete_drawings(data):
    if request.sid not in master_sids:
        return

    # La gomma può cancellare più disegni con un solo passaggio
    uids = [str(uid) for uid in (data or {}).get("uids", []) if uid]
    if not uids:
        return

    DrawItem.query.filter(DrawItem.uid.in_(uids)).delete(synchronize_session=False)
    db.session.commit()
    emit("drawing_deleted", {"uids": uids}, broadcast=True, include_self=False)


@socketio.on("ping_location")
def handle_ping_location(data):
    # Ritrasmette il segnale a tutti i client (incluso chi lo ha generato)
    emit("show_ping", data, broadcast=True)


@socketio.on("draw_laser")
def handle_draw_laser(data):
    # Ritrasmette la scia del laser a tutti gli altri giocatori
    emit("show_laser", data, broadcast=True, include_self=False)


@socketio.on("draw_stroke_progress")
def handle_draw_stroke_progress(data):
    if request.sid not in master_sids:
        return

    # Anteprima del tratto in corso: non si salva, arriva completo con draw_item
    emit("draw_stroke_progress", data, broadcast=True, include_self=False)


@socketio.on("draw_item")
def handle_draw_item(data):
    if request.sid not in master_sids:
        return

    try:
        data = dict(data or {})

        uid = str(data.get("uid") or uuid4())

        new_item = DrawItem(
            uid=uid,
            type=data.get("type", "line"),
            sx=data["sx"],
            sy=data["sy"],
            ex=data.get("ex", 0),
            ey=data.get("ey", 0),
            color=data.get("c", "#000000"),
            size=round(data.get("w", 3)),
            img_data=data.get("img", None),
            points=data.get("points", None)
        )

        db.session.add(new_item)
        db.session.commit()

        socketio.emit(
            "draw_item",
            new_item.to_dict(),
            skip_sid=request.sid
        )

    except Exception as e:
        db.session.rollback()
        print("Errore nel salvataggio disegno:", e)


@socketio.on("update_drawing")
def handle_update_drawing(data):
    if request.sid not in master_sids:
        return

    try:
        data = dict(data or {})

        item = DrawItem.query.filter_by(
            uid=data.get("uid")
        ).first()

        if not item:
            return

        item.sx = data.get("sx", item.sx)
        item.sy = data.get("sy", item.sy)
        item.ex = data.get("ex", item.ex)
        item.ey = data.get("ey", item.ey)

        # Manteniamo anche gli altri campi se vengono inviati.
        if data.get("type") is not None:
            item.type = data.get("type")
        if data.get("c") is not None:
            item.color = data.get("c")
        if data.get("w") is not None:
            item.size = round(data.get("w"))
        if "img" in data:
            item.img_data = data.get("img")
        if data.get("points") is not None:
            item.points = data.get("points")

        db.session.commit()

        socketio.emit(
            "drawing_updated",
            item.to_dict(),
            skip_sid=request.sid
        )

    except Exception as e:
        db.session.rollback()
        print("Errore aggiornamento disegno:", e)
