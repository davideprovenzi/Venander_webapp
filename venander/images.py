"""Immagini come file (cache del browser).

Pedine, foto, mappe, sticker: ogni data URL che sta per finire nel database
diventa un file in instance/images (vedi image_store.py). Così i giocatori
scaricano ogni immagine una volta sola, e gli aggiornamenti dei personaggi
non si portano dietro megabyte di base64.
"""
import json
import os
import sqlite3
from datetime import date
from flask import abort, send_from_directory
from venander.image_store import IMAGE_FILE_PATTERN, store_image, store_images_in_json
from sqlalchemy import event, text
from sqlalchemy.orm import Session
from venander.core import DB_FILE, ONE_YEAR, app, db
from venander.models import Character, DrawItem, NpcTemplate, NpcTokenPreset, Scene, WikiPage, WorldState


IMAGE_DIR = os.path.join(app.instance_path, "images")

# Colonne con un'immagine e colonne JSON che possono contenerne (es. "img" degli oggetti)
IMAGE_TEXT_COLUMNS = {
    Character: ("photo_url", "token_url"),
    NpcTokenPreset: ("image_data",),
    DrawItem: ("img_data",),
    WorldState: ("map_url",),
    Scene: ("map_url",),
    WikiPage: ("image",),
}

IMAGE_JSON_COLUMNS = {
    Character: ("stats", "weapons", "backpack", "loot"),
    NpcTemplate: ("data",),
    Scene: ("drawings", "trinkets"),
    WorldState: ("trinkets",),
}


def move_images_to_files(obj):
    """Sposta su file le immagini di una riga. True se ha cambiato qualcosa."""
    changed = False
    for column in IMAGE_TEXT_COLUMNS.get(type(obj), ()):
        value = getattr(obj, column)
        stored = store_image(value, IMAGE_DIR)
        if stored is not value:
            setattr(obj, column, stored)
            changed = True
    for column in IMAGE_JSON_COLUMNS.get(type(obj), ()):
        value = getattr(obj, column)
        if value and "data:image/" in json.dumps(value):
            setattr(obj, column, store_images_in_json(value, IMAGE_DIR))
            changed = True
    return changed


@event.listens_for(Session, "before_flush")
def images_before_flush(session, _flush_context, _instances):
    for obj in list(session.new) + list(session.dirty):
        if type(obj) in IMAGE_TEXT_COLUMNS or type(obj) in IMAGE_JSON_COLUMNS:
            move_images_to_files(obj)


@app.route("/images/<name>")
def serve_image(name):
    if not IMAGE_FILE_PATTERN.match(name):
        abort(404)
    return send_from_directory(IMAGE_DIR, name, max_age=ONE_YEAR)


def backup_database(reason):
    """Copia del database in instance/backups (sicura anche col server acceso)."""
    folder = os.path.join(app.instance_path, "backups")
    os.makedirs(folder, exist_ok=True)
    stem = os.path.splitext(os.path.basename(DB_FILE))[0]
    target_path = os.path.join(folder, f"{stem}-{date.today().isoformat()}-{reason}.db")
    source = sqlite3.connect(f"file:{DB_FILE}?mode=ro", uri=True)
    target = sqlite3.connect(target_path)
    with target:
        source.backup(target)
    source.close()
    target.close()
    return target_path


def migrate_images_to_files():
    """Una volta sola: le immagini già salvate nel database diventano file."""
    def rows_with_images():
        models = set(IMAGE_TEXT_COLUMNS) | set(IMAGE_JSON_COLUMNS)
        found = []
        for model in models:
            columns = IMAGE_TEXT_COLUMNS.get(model, ()) + IMAGE_JSON_COLUMNS.get(model, ())
            # Filtro in SQL: le righe senza "data:image/" non si caricano nemmeno
            condition = " OR ".join(f"CAST({column} AS TEXT) LIKE '%data:image/%'" for column in columns)
            ids = [row[0] for row in db.session.execute(text(f"SELECT id FROM {model.__tablename__} WHERE {condition}"))]
            found.extend((model, row_id) for row_id in ids)
        return found

    pending = rows_with_images()
    if not pending:
        return

    backup = backup_database("before-images-to-files")
    print(f"🖼️ Sposto le immagini del database in instance/images (copia di sicurezza: {os.path.relpath(backup, app.root_path)})...")
    moved = 0
    for model, row_id in pending:
        row = db.session.get(model, row_id)
        if row is not None and move_images_to_files(row):
            moved += 1
    db.session.commit()
    db.session.remove()

    # Il file del database si rimpicciolisce solo con VACUUM
    with db.engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        connection.exec_driver_sql("VACUUM")
    print(f"🖼️ Fatto: {moved} righe aggiornate.")
