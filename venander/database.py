"""Creazione del database, migrazioni leggere e popolamento iniziale.

create_all() non modifica le tabelle esistenti: le colonne nuove si
aggiungono qui con ALTER TABLE.
"""
from sqlalchemy import inspect, text
from venander import core
from venander.core import app, db, db_file_identity
from venander.images import migrate_images_to_files
from venander.models import Character, WorldState
from venander.wiki_seed import seed_ultrawiki


with app.app_context():
    db.create_all()
    # Migrazione leggera: aggiunge token_url ai vecchi database
    inspector = inspect(db.engine)
    character_columns = {
        column["name"]
        for column in inspector.get_columns("character")
    }

    if "token_url" not in character_columns:
        db.session.execute(
            text("ALTER TABLE character ADD COLUMN token_url TEXT DEFAULT ''")
        )
        db.session.commit()

    if "knowledge" not in character_columns:
        db.session.execute(
            text("ALTER TABLE character ADD COLUMN knowledge JSON DEFAULT '[]'")
        )
        db.session.commit()

    if "heal_rate" not in character_columns:
        db.session.execute(
            text("ALTER TABLE character ADD COLUMN heal_rate FLOAT DEFAULT 0")
        )
        db.session.commit()

    if "loot" not in character_columns:
        db.session.execute(text("ALTER TABLE character ADD COLUMN loot JSON DEFAULT '[]'"))
        db.session.commit()

    if "spawn_sound" not in character_columns:
        db.session.execute(text("ALTER TABLE character ADD COLUMN spawn_sound JSON"))
        db.session.commit()

    # Migrazione leggera delle sidequest per supportare armi forgiate come ricompensa.
    sidequest_columns = {
        column["name"]
        for column in inspector.get_columns("side_quest")
    }

    if "reward_weapon" not in sidequest_columns:
        db.session.execute(
            text("ALTER TABLE side_quest ADD COLUMN reward_weapon JSON")
        )
        db.session.commit()

    if "reward_delivered_to" not in sidequest_columns:
        db.session.execute(
            text("ALTER TABLE side_quest ADD COLUMN reward_delivered_to JSON DEFAULT '[]'")
        )
        db.session.commit()

    # Pagamenti divisi: spesa comune o quote assegnate dal Master
    for column, ddl in (
        ("payment_mode", "VARCHAR(20) DEFAULT 'each'"),
        ("shares", "JSON DEFAULT '{}'"),
        ("contributions", "JSON DEFAULT '{}'")
    ):
        if column not in sidequest_columns:
            db.session.execute(text(f"ALTER TABLE side_quest ADD COLUMN {column} {ddl}"))
            db.session.commit()

    # Migrazione leggera: i tratti liberi salvano tutti i punti in un'unica riga.
    draw_item_columns = {
        column["name"]
        for column in inspector.get_columns("draw_item")
    }

    if "points" not in draw_item_columns:
        db.session.execute(
            text("ALTER TABLE draw_item ADD COLUMN points JSON")
        )
        db.session.commit()

    world_state_columns = {
        column["name"]
        for column in inspector.get_columns("world_state")
    }

    if "active_scene_id" not in world_state_columns:
        db.session.execute(
            text("ALTER TABLE world_state ADD COLUMN active_scene_id INTEGER")
        )
        db.session.commit()

    # Terreno e superfici: sulla mappa attuale e salvati in ogni scena
    scene_columns = {
        column["name"]
        for column in inspector.get_columns("scene")
    }

    for table, columns in (("world_state", world_state_columns), ("scene", scene_columns)):
        for column in ("terrain", "surfaces"):
            if column not in columns:
                db.session.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN {column} JSON DEFAULT '{{}}'")
                )
                db.session.commit()

        # Trinket sulla mappa (bombe, fili, spie...): anche loro per scena
        if "trinkets" not in columns:
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN trinkets JSON DEFAULT '[]'"))
            db.session.commit()

    wiki_columns = {
        column["name"]
        for column in inspector.get_columns("wiki_page")
    }

    if "shared_with" not in wiki_columns:
        db.session.execute(
            text("ALTER TABLE wiki_page ADD COLUMN shared_with JSON DEFAULT '[]'")
        )
        db.session.commit()

    if not WorldState.query.first():
        db.session.add(WorldState())
        db.session.commit()

    if not Character.query.first():
        print("Popolamento iniziale del database in corso...")
        base_stats = {"Forza": 1, "Destrezza": 1, "Percezione": 1, "Arguzia": 1, "Volontà": 1, "Spirito": 1, "Virtù": 1}

        base_weapons = [
            {"name": "Mani Nude", "desc": "I tuoi pugni. Affidabili, ma non fanno molto danno."}
        ]

        base_backpack = [
            {"name": "Razioni", "qty": 3, "desc": "Cibo essenziale per sopravvivere nei viaggi lunghi."},
            {"name": "Borraccia", "qty": 1, "desc": "Piena d'acqua fresca e potabile."}
        ]
        party = [
            Character(name="Giocatore 1", role="player", pos_x=2, pos_y=2, color="#e74c3c", hp_current=200, hp_max=200, stats=base_stats.copy(), weapons=base_weapons, skills=[], backpack=base_backpack, is_hidden=False, xp=5000, shop=[]),
            Character(name="Giocatore 2", role="player", pos_x=3, pos_y=4, color="#3498db", hp_current=200, hp_max=200, stats=base_stats.copy(), weapons=base_weapons, skills=[], backpack=base_backpack, is_hidden=False, xp=5000, shop=[]),
            Character(name="Giocatore 3", role="player", pos_x=5, pos_y=1, color="#2ecc71", hp_current=200, hp_max=200, stats=base_stats.copy(), weapons=base_weapons, skills=[], backpack=base_backpack, is_hidden=False, xp=5000, shop=[])
        ]
        db.session.add_all(party)
        db.session.commit()
        print("Database popolato con 3 Giocatori standard!")

    seed_ultrawiki()
    migrate_images_to_files()

# Identità del file del database ora che esiste (vedi code_status)
core.STARTUP_DB_IDENTITY = db_file_identity()
