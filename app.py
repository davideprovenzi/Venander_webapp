from flask import Flask, render_template, request, send_from_directory, abort
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text
from flask_socketio import SocketIO, emit
from sqlalchemy.orm.attributes import flag_modified
import os
import random
import re
import json
import math
import copy
import functools
import uuid
import html
import base64
from uuid import uuid4
from threading import Lock

# ==========================================
# CONFIGURAZIONE FLASK
# ==========================================
app = Flask(__name__)
app.config["SECRET_KEY"] = "chiave_segreta_venander"
# L'ambiente di prova (test_env.py) usa una copia del database: venander_test.db
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{os.environ.get('VENANDER_DB', 'venander.db')}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
TEST_MODE = os.environ.get("VENANDER_TEST_MODE") == "1"

@app.context_processor
def inject_test_mode():
    return {"test_mode": TEST_MODE}

db = SQLAlchemy(app)
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    max_http_buffer_size=50000000,
    async_mode="threading"
)

# Serializza i cambi di posizione: evita che due richieste concorrenti
# occupino lo stesso esagono nello stesso istante.
movement_lock = Lock()

# ==========================================
# MODELLI DATABASE
# ==========================================
class Character(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), default="player") # "master" oppure "player"
    pos_x = db.Column(db.Integer, default=0)
    pos_y = db.Column(db.Integer, default=0)
    color = db.Column(db.String(20), default="#000000")

    photo_url = db.Column(db.Text, default="")
    token_url = db.Column(db.Text, default="")
    lore = db.Column(db.Text, default="")

    hp_current = db.Column(db.Integer, default=100)
    hp_max = db.Column(db.Integer, default=100)
    stamina_current = db.Column(db.Integer, default=100)
    stamina_max = db.Column(db.Integer, default=100)
    conc_current = db.Column(db.Integer, default=100)
    conc_max = db.Column(db.Integer, default=100)
    pa_stats = db.Column(db.JSON, default=dict)
    status = db.Column(db.String(50), default="Perfetta forma")
    stats = db.Column(db.JSON, default=dict)
    weapons = db.Column(db.JSON, default=list)
    skills = db.Column(db.JSON, default=list)
    backpack = db.Column(db.JSON, default=list)
    bonuses = db.Column(db.JSON, default=list)

    is_hidden = db.Column(db.Boolean, default=False)
    is_invisible = db.Column(db.Boolean, default=False)

    xp = db.Column(db.Integer, default=0)
    shop = db.Column(db.JSON, default=list)
    notes = db.Column(db.Text, default="")
    # HP recuperati per ogni ora di riposo lungo (deciso dal Master)
    heal_rate = db.Column(db.Float, default=0)
    spawn_sound = db.Column(db.JSON, default=None) # {"url": ..., "scope": "all" | "master"} dal modello NPC
    # Conoscenze del personaggio: [{"name": ..., "desc": ...}]
    knowledge = db.Column(db.JSON, default=list)

class NpcTokenPreset(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    image_data = db.Column(db.Text, nullable=False)

class Line(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    start_x = db.Column(db.Float, nullable=False)
    start_y = db.Column(db.Float, nullable=False)
    end_x = db.Column(db.Float, nullable=False)
    end_y = db.Column(db.Float, nullable=False)
    color = db.Column(db.String(20), default="#000000")
    width = db.Column(db.Integer, default=2)

class DrawItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    uid = db.Column(db.String(50), nullable=False, unique=True)
    type = db.Column(db.String(20), default="line") # 'stroke', 'line' (vecchi segmenti), 'rectangle', 'circle', 'square', 'triangle', 'icon'
    sx = db.Column(db.Float, nullable=False)
    sy = db.Column(db.Float, nullable=False)
    ex = db.Column(db.Float, default=0.0)
    ey = db.Column(db.Float, default=0.0)
    color = db.Column(db.String(20), default="#000000")
    size = db.Column(db.Integer, default=3) # Usato per lo spessore o per il raggio
    img_data = db.Column(db.Text, nullable=True) # Conterrà l'immagine convertita
    points = db.Column(db.JSON, nullable=True) # Solo 'stroke': lista di [x, y, spessore]

    def to_dict(self):
        return {
            "uid": self.uid,
            "type": self.type,
            "sx": self.sx,
            "sy": self.sy,
            "ex": self.ex,
            "ey": self.ey,
            "c": self.color,
            "w": self.size,
            "img": self.img_data,
            "points": self.points
        }

class WorldState(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    map_url = db.Column(db.Text, default="")
    map_scale = db.Column(db.Float, default=1.0)
    map_dx = db.Column(db.Integer, default=0)
    map_dy = db.Column(db.Integer, default=0)
    fow_enabled = db.Column(db.Boolean, default=False)
    revealed_hexes = db.Column(db.JSON, default=list)
    active_scene_id = db.Column(db.Integer, nullable=True) # Scena aperta in questo momento
    terrain = db.Column(db.JSON, default=dict)  # {"col,row": tipo di terreno}
    surfaces = db.Column(db.JSON, default=dict) # {"col,row": tipo di superficie}
    trinkets = db.Column(db.JSON, default=list) # trinket piazzati o lanciati sulla mappa

class Scene(db.Model):
    """Mappa salvata con i suoi disegni e la nebbia di guerra."""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    map_url = db.Column(db.Text, default="")
    map_scale = db.Column(db.Float, default=1.0)
    map_dx = db.Column(db.Integer, default=0)
    map_dy = db.Column(db.Integer, default=0)
    fow_enabled = db.Column(db.Boolean, default=False)
    revealed_hexes = db.Column(db.JSON, default=list)
    drawings = db.Column(db.JSON, default=list)
    terrain = db.Column(db.JSON, default=dict)
    surfaces = db.Column(db.JSON, default=dict)
    trinkets = db.Column(db.JSON, default=list)

class SideQuest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(160), nullable=False)
    description = db.Column(db.Text, default="")
    cost = db.Column(db.Integer, default=0)
    # None = visibile a tutti i giocatori; altrimenti solo al personaggio indicato.
    target_char_id = db.Column(db.Integer, nullable=True)
    paid_by = db.Column(db.JSON, default=list)
    # Ricompensa opzionale: definizione completa di un'arma forgiata dal Master.
    reward_weapon = db.Column(db.JSON, nullable=True)
    # Tiene traccia dei personaggi che hanno già ricevuto la ricompensa.
    reward_delivered_to = db.Column(db.JSON, default=list)
    # Come pagano i giocatori una sidequest per tutti:
    # "each" ognuno il costo intero, "shared" spesa comune divisa liberamente,
    # "assigned" quote decise dal Master
    payment_mode = db.Column(db.String(20), default="each")
    shares = db.Column(db.JSON, default=dict)        # quote: {"char_id": euro}
    contributions = db.Column(db.JSON, default=dict) # versato: {"char_id": euro}
    active = db.Column(db.Boolean, default=True)

class WikiPage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(160), nullable=False)
    category = db.Column(db.String(60), default="Generale")
    content = db.Column(db.Text, default="")
    image = db.Column(db.Text, nullable=True) # URL o data URI dell'illustrazione
    # Le pagine segrete le vede solo il Master, finché non le rivela.
    hidden = db.Column(db.Boolean, default=False)
    # Consegnata come handout: questi personaggi la vedono anche se segreta
    shared_with = db.Column(db.JSON, default=list)

    def is_visible_to(self, role, char_id):
        if role == "master" or not self.hidden:
            return True
        return char_id is not None and char_id in (self.shared_with or [])

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "category": self.category or "Generale",
            "content": self.content or "",
            "image": self.image,
            "hidden": bool(self.hidden),
            "shared_with": list(self.shared_with or [])
        }

    def payload_for(self, role, char_id):
        """Ai giocatori non serve sapere a chi altro è stata consegnata."""
        data = self.to_dict()
        if role != "master":
            data["shared_with"] = []
            data["handout"] = bool(self.hidden)
        return data

class CustomCompendiumItem(db.Model):
    """Oggetto aggiunto dal Master, unito al compendio (che è generato da un foglio di calcolo)."""
    id = db.Column(db.String(60), primary_key=True)  # stesso formato degli id del compendio
    data = db.Column(db.JSON, nullable=False)

class ItemPriceOverride(db.Model):
    """Prezzo deciso dal Master durante il gioco; vince su quello del compendio."""
    compendium_id = db.Column(db.String(60), primary_key=True)
    cost_eur = db.Column(db.Integer, nullable=True)  # None = prezzo da definire

class CombatModifier(db.Model):
    """Bonus/malus all'attacco deciso dal Master per una situazione, riproposto le volte dopo."""
    key = db.Column(db.String(80), primary_key=True)  # es. "mira_testa", "copertura_parziale"
    label = db.Column(db.String(120), nullable=False)
    value = db.Column(db.Integer, nullable=False)

class NpcTemplate(db.Model):
    """Modello di NPC del Master: statistiche, equipaggiamento e armi pronti da spawnare."""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    data = db.Column(db.JSON, nullable=False)

class MasterForgeWeapon(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    definition = db.Column(db.JSON, nullable=False)


# ==========================================
# MEMORIA GLOBALE COMBATTIMENTO E SETUP DB
# ==========================================
pending_attacks = {}
pending_combat_results = {}
master_sids = set()
client_roles = {}
client_character_ids = {}

combat_state = {
    "is_active": False,
    "turn_order": [],
    "current_index": 0,
    "epicenter": {"x": 0, "y": 0},
    "players_pa": {},  # Dizionario per memorizzare i PA dei giocatori
    "players_limbs":{},
    # Interruzioni da Minacciare in attesa: la prima è quella in corso
    "interrupts": []
}

# Aree minacciate. Separate da combat_state perché quelle degli NPC
# le vede solo il Master (combat_state viene inviato a tutti).
combat_threats = []

# Funzione per leggere sempre i dati aggiornati dal database
def get_world_state():
    ws = WorldState.query.first()
    return {
        "map_url": ws.map_url,
        "map_scale": ws.map_scale,
        "map_dx": ws.map_dx,
        "map_dy": ws.map_dy,
        "fow_enabled": ws.fow_enabled,
        "revealed_hexes": ws.revealed_hexes,
        "terrain": ws.terrain or {},
        "surfaces": ws.surfaces or {}
    }

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

# ==========================================
# ROTTE WEB & SERIALIZZAZIONE
# ==========================================
# ==========================================
# SUONI DEGLI NPC
# Il Master registra (o carica) un suono per un modello NPC: si sente
# quando un NPC di quel modello compare agli occhi dei giocatori.
# I file stanno in instance/sounds, come il database (fuori da git).
# ==========================================
SOUND_DIR = os.path.join(app.instance_path, "sounds")
SOUND_MAX_BYTES = 1_000_000
SOUND_TYPES = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp3": "mp3",
               "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac"}
SOUND_FILE_PATTERN = re.compile(r"^[0-9a-f]{32}\.(webm|ogg|mp3|wav|m4a|aac)$")

@app.route("/sounds/<name>")
def serve_sound(name):
    if not SOUND_FILE_PATTERN.match(name):
        abort(404)
    return send_from_directory(SOUND_DIR, name, max_age=86400)

def save_sound_data_url(data_url):
    """data:audio/...;base64,... -> URL del file salvato (o un messaggio d'errore)."""
    match = re.match(r"^data:([\w/+.-]+)(?:;[^,]*)?;base64,(.*)$", str(data_url or ""), re.S)
    if not match:
        return None, "Formato del suono non valido."
    mime = match.group(1).lower()
    ext = SOUND_TYPES.get(mime)
    if not ext:
        return None, f"Tipo di file non supportato ({mime}): usa mp3, ogg, wav, webm o m4a."
    try:
        raw = base64.b64decode(match.group(2), validate=False)
    except (ValueError, TypeError):
        return None, "Il file del suono è danneggiato."
    if not raw or len(raw) > SOUND_MAX_BYTES:
        return None, f"Il suono deve pesare al massimo {SOUND_MAX_BYTES // 1000} KB."
    os.makedirs(SOUND_DIR, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{ext}"
    with open(os.path.join(SOUND_DIR, name), "wb") as handle:
        handle.write(raw)
    return f"/sounds/{name}", None

@app.route("/")
def index():
    chars = Character.query.order_by(Character.id).all()
    return render_template("index.html", characters=chars)

def get_char_data(char):
    return {
        "id": char.id, "name": char.name, "role": char.role, "x": char.pos_x, "y": char.pos_y, "color": char.color,
        "photo_url": char.photo_url, "token_url": char.token_url, "lore": char.lore, "hp_current": char.hp_current, "hp_max": char.hp_max,
        "stamina_current": char.stamina_current, "stamina_max": char.stamina_max,
        "conc_current": char.conc_current, "conc_max": char.conc_max, "pa_stats": char.pa_stats,
        "status": char.status, "stats": char.stats, "weapons": char.weapons,
        "skills": char.skills, "backpack": char.backpack, "bonuses": char.bonuses, "is_hidden": char.is_hidden,
        "is_invisible": char.is_invisible,"xp": char.xp, "shop": char.shop, "notes": char.notes,
        "heal_rate": char.heal_rate or 0,
        "knowledge": char.knowledge or [],
        "spawn_sound": char.spawn_sound
    }


def get_public_char_data(char):
    """Dati visibili a un normale giocatore.

    I personaggi giocanti restano invariati. Degli NPC vengono inviati solo
    i dati necessari per mappa, targeting e scheda pubblica: mai HP o stats.
    """
    if char.role != "npc":
        return get_char_data(char)

    return {
        "id": char.id,
        "name": char.name,
        "role": char.role,
        "x": char.pos_x,
        "y": char.pos_y,
        "color": char.color,
        "photo_url": char.photo_url,
        "token_url": char.token_url,
        "lore": char.lore,
        "is_hidden": char.is_hidden,
        "is_invisible": char.is_invisible,
        # Gli HP restano segreti: ai giocatori basta sapere se è a terra
        "is_defeated": (char.hp_current or 0) <= 0,
        # Il suono "solo Master" non arriva nemmeno ai giocatori
        "spawn_sound": char.spawn_sound if (char.spawn_sound or {}).get("scope") == "all" else None
    }


# ==========================================
# PERMESSI
# Il server non si fida del client: il Master può tutto,
# un giocatore agisce solo sul personaggio con cui si è registrato.
# ==========================================
LIMB_KEYS = ("bd", "bs", "gd", "gs")
DEFAULT_LIMB_FRAMES = 60
DEFAULT_MOVE_FRAMES = 120

# Raggio visivo dei giocatori con la nebbia di guerra (come VISION_RADIUS in game.js)
VISION_RADIUS = 3

# Frame per passo: devono coincidere con i pulsanti del popup movimento
MOVE_FRAME_COSTS = {"Camminata": 20, "Corsa": 15, "Furtivo": 25}

def is_master_request():
    return request.sid in master_sids

def controls_character(char):
    """True se chi invia l'evento può agire per questo personaggio."""
    if char is None:
        return False

    if is_master_request():
        return True

    return char.role == "player" and client_character_ids.get(request.sid) == char.id

def current_combat_actor_id():
    if not combat_state.get("is_active") or not combat_state.get("turn_order"):
        return None

    try:
        return int(combat_state["turn_order"][combat_state["current_index"]]["id"])
    except (KeyError, IndexError, TypeError, ValueError):
        return None

def acting_combatant_id():
    """Chi può agire ora: chi sta interrompendo con Minacciare, altrimenti chi è di turno."""
    if combat_state.get("interrupts"):
        return combat_state["interrupts"][0]["threatener_id"]
    return current_combat_actor_id()

def interrupt_target_error(attacker, target):
    """Durante l'interruzione di una minaccia si colpisce solo chi è entrato nell'area."""
    interrupt = (combat_state.get("interrupts") or [None])[0]
    if not combat_state.get("is_active") or not interrupt:
        return None
    if attacker.id != interrupt["threatener_id"]:
        return f"Ora agisce solo {interrupt['threatener_name']} (minaccia scattata)."
    if target.id != interrupt["intruder_id"]:
        return f"Nella minaccia puoi bersagliare solo {interrupt['intruder_name']}, che è entrato nell'area."
    return None

def is_players_turn(char):
    """In combattimento un giocatore agisce solo nel proprio turno; il Master sempre."""
    if is_master_request() or not combat_state.get("is_active"):
        return True

    return acting_combatant_id() == char.id

def get_limb_frames(char_id):
    limbs = combat_state["players_limbs"].setdefault(
        str(char_id),
        {limb: DEFAULT_LIMB_FRAMES for limb in LIMB_KEYS}
    )

    for limb in LIMB_KEYS:
        limbs.setdefault(limb, DEFAULT_LIMB_FRAMES)

    return limbs

def spend_limb_frames(char_id, shares, cost):
    """Scala il costo diviso tra più arti. Restituisce un messaggio d'errore o None."""
    clean_shares = {}

    for limb, amount in (shares or {}).items():
        if limb not in LIMB_KEYS:
            return "Arto non valido."
        try:
            amount = int(amount)
        except (TypeError, ValueError):
            return "Ripartizione dei frame non valida."
        if amount < 0:
            return "Ripartizione dei frame non valida."
        if amount:
            clean_shares[limb] = amount

    if sum(clean_shares.values()) != cost:
        return f"La ripartizione dei frame non corrisponde al costo ({cost})."

    limbs = get_limb_frames(char_id)

    for limb, amount in clean_shares.items():
        if limbs[limb] < amount:
            return f"Frame insufficienti nell'arto {limb.upper()}: ne servono {amount}, ne hai {limbs[limb]}."

    for limb, amount in clean_shares.items():
        limbs[limb] -= amount

    socketio.emit("sync_limbs", {"char_id": char_id, "limbs": limbs})
    return None

def threats_visible_to(role):
    # Le minacce degli NPC restano segrete ai giocatori
    return [t for t in combat_threats if role == "master" or t["owner_role"] == "player"]

def emit_threats():
    for sid, role in list(client_roles.items()):
        socketio.emit("threats_update", threats_visible_to(role), to=sid)

def clear_threats_of(char_id):
    """Una minaccia dura fino al turno successivo di chi l'ha dichiarata."""
    global combat_threats
    before = len(combat_threats)
    combat_threats = [t for t in combat_threats if t["char_id"] != char_id]
    if len(combat_threats) != before:
        emit_threats()

def find_threat_stop(mover, path):
    """Primo esagono del percorso in cui il personaggio entra in un'area minacciata da altri.

    Restituisce (indice nel percorso, minacce scattate) oppure (None, []).
    """
    def inside(threat, hex_pos):
        return f"{hex_pos[0]},{hex_pos[1]}" in threat["hexes"]

    # Scatta per chiunque entri, tranne chi minaccia: è lui a decidere se agire o lasciar passare
    other_threats = [t for t in combat_threats if t["char_id"] != mover.id]

    for index in range(1, len(path)):
        entered = [
            t for t in other_threats
            if inside(t, path[index]) and not inside(t, path[index - 1])
        ]
        if entered:
            return index, entered

    return None, []

def emit_combat_error(message):
    emit("dice_result", {"name": "SISTEMA", "message": f"⚠️ {html.escape(message)}", "is_master_roll": False}, to=request.sid)

# ==========================================
# ANNULLA ULTIMA AZIONE (MASTER) E NUMERI FLUTTUANTI
# Prima di ogni azione di gioco si fotografano combattimento e personaggi;
# se l'azione cambia qualcosa la foto finisce in una pila. "Annulla"
# ripristina l'ultima. Dal confronto prima/dopo escono anche i numeri
# fluttuanti sugli HP che cambiano.
# ==========================================
UNDO_LIMIT = 15
UNDO_CHAR_FIELDS = (
    "pos_x", "pos_y", "hp_current", "stamina_current", "conc_current",
    "pa_stats", "bonuses", "stats", "weapons", "backpack", "heal_rate"
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

def clean_character_name(value):
    """I nomi finiscono in molti messaggi HTML: niente caratteri di markup."""
    return re.sub(r"[<>&\"'`]", "", str(value or "")).strip()[:60]

def get_char_data_for_role(char, role):
    return get_char_data(char) if role == "master" else get_public_char_data(char)


def emit_initial_state_to_sid(sid, role):
    chars = Character.query.order_by(Character.id).all()
    char_list = [get_char_data_for_role(char, role) for char in chars]
    socketio.emit("init_state", char_list, to=sid)


def emit_character_update(char, extra=None):
    """Invia l'aggiornamento completo ai Master e quello pubblico ai giocatori."""
    extra = extra or {}

    for sid, role in list(client_roles.items()):
        payload = dict(get_char_data_for_role(char, role))
        payload.update(extra)
        socketio.emit("update_character", payload, to=sid)

# ==========================================
# SIDEQUEST / CHAT
# ==========================================
def _clean_int(value, default=None, minimum=None, maximum=None):
    if value in (None, ""):
        return default
    try:
        number = int(float(str(value).replace(",", ".")))
    except (TypeError, ValueError):
        return default
    if minimum is not None:
        number = max(minimum, number)
    if maximum is not None:
        number = min(maximum, number)
    return number

def _clean_float(value, default=None, minimum=None):
    if value in (None, ""):
        return default
    try:
        number = float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return default
    if minimum is not None:
        number = max(minimum, number)
    return number

def build_forged_weapon(raw):
    """Valida i campi della forgia e costruisce una voce compatibile col compendio."""
    if not isinstance(raw, dict):
        return None

    name = str(raw.get("name", "")).strip()[:120]
    if not name:
        return None

    description = str(raw.get("description", "")).strip()[:2000]
    brand = str(raw.get("brand", "")).strip()[:100] or "Forgiata dal Master"
    targeting = str(raw.get("targeting", "Melee")).strip().title()
    if targeting not in {"Melee", "Ranged"}:
        targeting = "Melee"

    characteristic = str(raw.get("characteristic", "DES")).strip().upper()[:12]
    damage = _clean_int(raw.get("damage"), 0, 0, 100000)
    damage_type = str(raw.get("damage_type", "")).strip()[:80] or None
    hp = _clean_int(raw.get("hp"), 100, 0, 100000)
    action_cost = _clean_int(raw.get("action_cost"), 0, 0, 100000)
    attack_speed = _clean_int(raw.get("attack_speed"), None, 1, 1000)
    hands = _clean_int(raw.get("hands"), 1, 1, 2)

    if attack_speed is None:
        return None

    ammo = str(raw.get("ammo", "")).strip()[:100] or None
    ammo_qty = _clean_int(raw.get("ammo_qty"), None, 0, 100000)
    base_malus = _clean_int(raw.get("base_malus"), None, -100000, 100000)
    aim_time = _clean_int(raw.get("aim_time"), None, 0, 100000)

    range_bands = [
        _clean_float(raw.get("range_1"), None, 0),
        _clean_float(raw.get("range_2"), None, 0),
        _clean_float(raw.get("range_3"), None, 0),
    ]
    range_malus = [
        _clean_int(raw.get("range_malus_1"), None, -100000, 100000),
        _clean_int(raw.get("range_malus_2"), None, -100000, 100000),
        _clean_int(raw.get("range_malus_3"), None, -100000, 100000),
    ]

    if targeting == "Melee":
        max_range = 1.0
    else:
        max_range = next((v for v in reversed(range_bands) if v is not None), None)

    license_name = str(raw.get("license_name", "")).strip()[:160] or None
    weight = _clean_float(raw.get("weight"), 0, 0)
    harmonization = _clean_int(raw.get("harmonization"), 0, 0, 100000)
    value_eur = _clean_float(raw.get("value_eur"), None, 0)

    custom_id = f"CUSTOM-WPN-{uuid.uuid4().hex[:12].upper()}"
    allowed_slots = ["mano_dx", "mano_sx"]

    return {
        "id": custom_id,
        "name": name,
        "brand": brand,
        "class": "Arma",
        "type": "Arma / corpo a corpo" if targeting == "Melee" else "Arma / distanza",
        "text": {
            "description": description or None,
            "original_rules": None,
            "effect_summary": None
        },
        "equipment": {
            "slot": {
                "raw": "Mano",
                "family": "mano",
                "position": None,
                "count": hands,
                "allowed_slots": allowed_slots,
                "occupancy": "all" if hands == 2 else "one"
            },
            "cost_eur": value_eur,
            "weight": weight,
            "harmonization": harmonization,
            "hp": hp
        },
        "requirements": {
            "raw": f"Richiede {license_name} per l’uso." if license_name else None,
            "items": [license_name] if license_name else [],
            "limitations": None
        },
        "activation": {
            "mode": "Attacco",
            "speed": {
                "activation": None,
                "effect_or_action": attack_speed,
                "reload": None
            },
            "cost": {
                "PA": action_cost,
                "PAA": None,
                "PAV": None,
                "PAP": None,
                "maintenance": None
            },
            "condition": None
        },
        "combat": {
            "damage": {
                "formula": f"{damage} HP",
                "type": damage_type
            },
            "healing": None,
            "check": {
                "required": characteristic,
                "modifier": base_malus
            },
            "range": {
                "max_m": max_range,
                "movement_m": None
            },
            "area": {
                "shape": None,
                "size": None,
                "angle_deg": None,
                "targets": None
            },
            "duration": None,
            "cooldown": None
        },
        "resource": {
            "name": ammo,
            "capacity": ammo_qty,
            "consumption": 1 if ammo else None,
            "reload_cost": None
        },
        "effects": {
            "bonus_malus": None,
            "state": None,
            "protection": None,
            "resistance": None,
            "movement_modifier": None,
            "conditional_modifiers": None,
            "special_notes": {
                "base_malus": base_malus,
                "range_bands_m": range_bands,
                "range_malus": range_malus,
                "aim_time": aim_time
            }
        },
        "source": "Arma forgiata dal Master",
        "weapon": {
            "damage": damage,
            "damage_type": damage_type,
            "characteristic": characteristic,
            "action_cost": action_cost,
            "attack_speed": attack_speed,
            "hands": hands,
            "targeting": targeting,
            "ammo": ammo,
            "ammo_qty": ammo_qty,
            "base_malus": base_malus,
            "range_bands_m": range_bands,
            "range_malus": range_malus,
            "aim_time": aim_time,
            "license_id": None,
            "license_name": license_name
        }
    }

def forged_weapon_inventory_entry(definition, quest_id=None):
    if not isinstance(definition, dict):
        return None

    return {
        "compendium_id": definition.get("id"),
        "name": definition.get("name") or "Arma forgiata",
        "brand": definition.get("brand"),
        "desc": (definition.get("text") or {}).get("description") or "Arma forgiata dal Master.",
        "qty": 1,
        "forged": True,
        "forged_from_sidequest": quest_id,
        "custom_definition": definition
    }

def serialize_master_forge_weapon(template):
    definition = template.definition if isinstance(template.definition, dict) else {}
    return {
        "id": template.id,
        "name": template.name,
        "definition": definition
    }

def get_master_forge_library():
    templates = MasterForgeWeapon.query.order_by(MasterForgeWeapon.name.asc(), MasterForgeWeapon.id.asc()).all()
    return [serialize_master_forge_weapon(template) for template in templates]

def emit_master_forge_library():
    payload = get_master_forge_library()
    for sid in list(master_sids):
        socketio.emit("master_forge_library", payload, to=sid)

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

# ==========================================
# WEBSOCKET - CONNESSIONE / RUOLI SESSIONE
# ==========================================
def emit_to_masters(event_name, data):
    """Invia un evento solo ai socket registrati come Master."""
    for sid in list(master_sids):
        socketio.emit(event_name, data, to=sid)

@socketio.on("register_session_role")
def handle_register_session_role(data):
    data = data or {}
    role = str(data.get("role", "")).strip().lower()
    role = "master" if role == "master" else "player"
    previous_role = client_roles.get(request.sid)
    previous_char_id = client_character_ids.get(request.sid)

    char_id = None
    if role == "player":
        try:
            candidate = int(data.get("char_id"))
        except (TypeError, ValueError):
            candidate = None

        if candidate:
            char = db.session.get(Character, candidate)
            if char and char.role == "player":
                char_id = char.id

    client_roles[request.sid] = role
    client_character_ids[request.sid] = char_id
    master_sids.discard(request.sid)

    if role == "master":
        master_sids.add(request.sid)

        # Sincronizza la Fucina persistente del Master.
        emit("master_forge_library", get_master_forge_library(), to=request.sid)

        # Se il Master ricarica la pagina mentre ci sono risultati
        # in attesa, glieli rimandiamo.
        for result in pending_combat_results.values():
            emit("master_pending_combat_result", result, to=request.sid)

    # Invia lo stato corretto solo alla prima registrazione o quando cambia ruolo.
    if previous_role != role:
        emit_initial_state_to_sid(request.sid, role)

    # Le sidequest dipendono anche dal personaggio selezionato.
    if previous_role != role or previous_char_id != char_id:
        emit_sidequest_list_to_sid(request.sid, role, char_id)

    # Gli handout del wiki dipendono dal personaggio scelto (e così i trinket visibili).
    if previous_role != role or previous_char_id != char_id:
        emit_wiki_list_to_sid(request.sid, role)
        socketio.emit("trinkets_update", trinkets_visible_to(role, char_id), to=request.sid)
        if role == "master":
            emit_explosions()
        # Attacchi ancora in attesa di reazione per questo personaggio
        emit_pending_attacks_to_sid(request.sid, role, char_id)

    # Il Master riceve anche le minacce degli NPC, le scene e i modelli NPC.
    if previous_role != role:
        socketio.emit("threats_update", threats_visible_to(role), to=request.sid)
        socketio.emit("aims_update", combat_aims, to=request.sid)
        socketio.emit("exchanges_update", list(pending_exchanges.values()), to=request.sid)
        if role == "master":
            socketio.emit("scene_list", get_scene_list(), to=request.sid)
            socketio.emit("undo_status", {
                "count": len(undo_stack),
                "label": undo_stack[-1]["label"] if undo_stack else None
            }, to=request.sid)
            socketio.emit("npc_template_list", get_npc_template_list(), to=request.sid)

@socketio.on("disconnect")
def handle_disconnect():
    master_sids.discard(request.sid)
    client_roles.pop(request.sid, None)
    client_character_ids.pop(request.sid, None)

@socketio.on("connect")
def handle_connect():
    # init_state viene inviato subito dopo register_session_role, così il server
    # sa se deve fornire dati completi (Master) o pubblici (Giocatore).
    draw_list = [d.to_dict() for d in DrawItem.query.all()]

    emit("combat_update", combat_state)
    emit("init_drawings", draw_list) # Invia i nuovi disegni
    emit("compendio_data", load_compendio())
    emit("map_update", get_world_state())
# ==========================================
# GESTIONE COMBATTIMENTO
# ==========================================
@socketio.on("toggle_combat")
@undoable("Avvio/fine combattimento")
def handle_toggle_combat():
    if not is_master_request():
        return

    global combat_state
    combat_state["is_active"] = not combat_state["is_active"]

    # Un nuovo stato di combattimento invalida richieste e risultati precedenti.
    pending_attacks.clear()
    pending_combat_results.clear()
    pending_exchanges.clear()
    emit_exchanges()
    combat_state["interrupts"] = []
    combat_threats.clear()
    emit_threats()
    combat_aims.clear()
    emit_aims()

    if combat_state["is_active"]:
        characters = Character.query.filter_by(is_hidden=False).all()
        if not characters:
            combat_state["is_active"] = False
            return

        # 1. Calcolo Epicentro (Centro di massa)
        sum_x = sum(c.pos_x for c in characters)
        sum_y = sum(c.pos_y for c in characters)
        ep_x = round(sum_x / len(characters))
        ep_y = round(sum_y / len(characters))

        combat_state["epicenter"] = {
            "x": ep_x,
            "y": ep_y
        }

        # 2. Calcolo Iniziativa (Distanza dall'epicentro)
        turn_order = []
        combat_state["players_pa"] = {} # Azzera la memoria PA per la nuova battaglia
        for c in characters:
            dist = round(math.hypot(c.pos_x - ep_x, c.pos_y - ep_y), 1)
            turn_order.append({
                "id": c.id, "name": c.name, "distance": dist,
                "is_npc": c.role == "npc", "start_x": c.pos_x, "start_y": c.pos_y
            })
            combat_state["players_pa"][str(c.id)] = 120 # Dà a tutti 120 frames
            combat_state["players_limbs"][str(c.id)] = {"bd": 60, "bs": 60, "gd": 60, "gs": 60} # 60 frames per arto

        # Ordina l'array dal più vicino (distanza minore) al più lontano
        turn_order.sort(key=lambda x: x["distance"])

        combat_state["turn_order"] = turn_order
        combat_state["current_index"] = 0

        prompt_turn_start_surface(turn_order[0]["id"])

        emit("dice_result", {"name": "SISTEMA", "message": "⚔️ <b>COMBATTIMENTO INIZIATO!</b> L'ordine di turno è calcolato in base alla vicinanza all'epicentro.", "is_master_roll": True}, broadcast=True)
    else:
        combat_state["turn_order"] = []
        emit("dice_result", {"name": "SISTEMA", "message": "🕊️ <b>Combattimento terminato.</b>", "is_master_roll": True}, broadcast=True)

    emit("combat_update", combat_state, broadcast=True)

@socketio.on("next_turn")
@undoable("Fine turno")
def handle_next_turn():
    global combat_state
    if not combat_state["is_active"] or not combat_state["turn_order"]:
        return

    # Il turno lo chiude il Master o chi controlla il personaggio di turno
    if not controls_character(db.session.get(Character, current_combat_actor_id())):
        return

    # Prima si chiudono le interruzioni in corso (il Master può forzare)
    if combat_state["interrupts"]:
        if not is_master_request():
            emit_combat_error("C'è un'interruzione in corso: aspetta che finisca.")
            return
        combat_state["interrupts"] = []

    # Scala effetti per turno
    current_actor_info = combat_state["turn_order"][combat_state["current_index"]]
    char = db.session.get(Character, current_actor_info["id"])

    if char and char.bonuses:
        if isinstance(char.bonuses, list):
            updated_bonuses = []
            expired_effects = []
            chat_messages = []

            for b in char.bonuses:
                if isinstance(b, dict) and "turns" in b:
                    # Crea una copia fresca del dizionario per assicurarsi che SQLAlchemy rilevi il cambiamento
                    new_b = dict(b)

                    hp_change = int(new_b.get("hpChange", 0))
                    if hp_change != 0:
                        old_hp = char.hp_current
                        char.hp_current = max(0, min(char.hp_max, char.hp_current + hp_change))
                        actual_change = char.hp_current - old_hp

                        if actual_change < 0:
                            chat_messages.append(f"ha subito {-actual_change} danni da <b>{new_b['name']}</b>")
                        elif actual_change > 0:
                            chat_messages.append(f"ha recuperato {actual_change} HP grazie a <b>{new_b['name']}</b>")

                    # SCALA I TURNI SULLA COPIA
                    new_b["turns"] -= 1
                    if new_b["turns"] > 0:
                        updated_bonuses.append(new_b)
                    else:
                        expired_effects.append(new_b["name"])
                else:
                    updated_bonuses.append(b)

            char.bonuses = updated_bonuses
            flag_modified(char, "bonuses") # Forza il salvataggio della colonna JSON
            db.session.commit()
            emit_character_update(char)

            # Invia i messaggi di danno/cura alla chat di tutti
            for msg in chat_messages:
                emit("dice_result", {"name": char.name, "message": msg, "is_master_roll": False}, broadcast=True)

            # Avvisa se un effetto svanisce
            if expired_effects:
                msg = f"Effetti terminati: <b>{', '.join(expired_effects)}</b>"
                emit("dice_result", {"name": char.name, "message": msg, "is_master_roll": False}, broadcast=True)

    # --- PROCEDI AL PROSSIMO ATTORE ---
    next_index = combat_state["current_index"] + 1

    if next_index >= len(combat_state["turn_order"]):
        characters = Character.query.filter_by(is_hidden=False).all()
        if not characters:
            return

        sum_x = sum(c.pos_x for c in characters)
        sum_y = sum(c.pos_y for c in characters)
        ep_x = round(sum_x / len(characters))
        ep_y = round(sum_y / len(characters))

        combat_state["epicenter"] = {"x": ep_x, "y": ep_y}

        turn_order = []
        for c in characters:
            dist = round(math.hypot(c.pos_x - ep_x, c.pos_y - ep_y), 1)
            turn_order.append({
                "id": c.id, "name": c.name, "distance": dist,
                "is_npc": c.role == "npc", "start_x": c.pos_x, "start_y": c.pos_y
            })
            # NUOVO ROUND: RESETTA GLI ARTI A TUTTI
            combat_state["players_limbs"][str(c.id)] = {"bd": 60, "bs": 60, "gd": 60, "gs": 60}

        turn_order.sort(key=lambda x: x["distance"])
        combat_state["turn_order"] = turn_order
        combat_state["current_index"] = 0

        emit("dice_result", {"name": "SISTEMA", "message": "🔄 <b>NUOVO ROUND!</b> L'epicentro si è spostato e l'ordine di turno è stato ricalcolato.", "is_master_roll": True}, broadcast=True)

    else:
        combat_state["current_index"] = next_index
        next_char_id = combat_state["turn_order"][combat_state["current_index"]]["id"]
        combat_state["players_pa"][str(next_char_id)] = 120 # Ripristina i 120 frame del nuovo giocatore
        next_char = db.session.get(Character, next_char_id)
        if next_char:
            combat_state["turn_order"][combat_state["current_index"]]["start_x"] = next_char.pos_x
            combat_state["turn_order"][combat_state["current_index"]]["start_y"] = next_char.pos_y

    # Le minacce di chi inizia il turno scadono
    clear_threats_of(current_combat_actor_id())

    # Chi inizia il turno sopra una superficie ne subisce di nuovo l'effetto
    prompt_turn_start_surface(current_combat_actor_id())

    emit("combat_update", combat_state, broadcast=True)
# ==========================================
# GESTIONE PEDINE E MAPPA
# ==========================================
@socketio.on("register_player")
def handle_register_player(data):
    char_id = data.get("char_id")
    name = clean_character_name(data.get("name", ""))
    if not char_id or not name: return
    char = db.session.get(Character, char_id)
    if not char or char.role != "player" or not controls_character(char): return

    existing = Character.query.filter(Character.name == name, Character.id != char_id).first()
    if existing: return

    char.name = name
    db.session.commit()
    emit_character_update(char)

@socketio.on("declare_move")
@undoable("Movimento")
def handle_move(data):
    try:
        char_id = int(data.get("char_id"))
        target_x = int(data.get("target_x"))
        target_y = int(data.get("target_y"))
    except (TypeError, ValueError):
        return

    move_id = data.get("move_id")
    mode = data.get("mode")

    with movement_lock:
        char = db.session.get(Character, char_id)
        if not char or char.role == "master" or not controls_character(char):
            return

        def reject(reason):
            emit("move_rejected", {
                "char_id": char_id,
                "move_id": move_id,
                "reason": reason,
                "current_x": char.pos_x,
                "current_y": char.pos_y
            })

        occupied = Character.query.filter(
            Character.pos_x == target_x,
            Character.pos_y == target_y,
            Character.id != char_id
        ).first()

        if occupied:
            reject("occupied")
            return

        # I muri non si attraversano (il Master può comunque riposizionare
        # le pedine liberamente, senza andatura)
        ws = WorldState.query.first()
        if mode or not is_master_request():
            full_path = hex_line(char.pos_x, char.pos_y, target_x, target_y)
            if any(hex_key(hx, hy) in wall_hexes(ws) for hx, hy in full_path[1:]):
                reject("wall")
                return

        # Entrando in un'area minacciata da un nemico ci si ferma lì
        triggered_threats = []
        in_combat_now = combat_state.get("is_active") and combat_state.get("turn_order")
        if in_combat_now and combat_threats:
            path = hex_line(char.pos_x, char.pos_y, target_x, target_y)
            stop_index, triggered_threats = find_threat_stop(char, path)

            if stop_index is not None:
                # Se l'esagono è occupato si ferma sull'ultimo libero prima
                for index in range(stop_index, 0, -1):
                    hx, hy = path[index]
                    if not Character.query.filter(
                        Character.pos_x == hx, Character.pos_y == hy, Character.id != char_id
                    ).first():
                        target_x, target_y = hx, hy
                        break
                else:
                    target_x, target_y = char.pos_x, char.pos_y

        # Mezza barricata (copertura parziale): in combattimento un giocatore la scavalca
        # spendendo 5 PA di una statistica a sua scelta, altrimenti non passa
        barricade_cost = None
        if (
            combat_state.get("is_active") and char.role == "player"
            and (mode or not is_master_request())
        ):
            path_now = hex_line(char.pos_x, char.pos_y, target_x, target_y)
            barricades = sum(
                1 for hx, hy in path_now[1:]
                if (ws.terrain or {}).get(hex_key(hx, hy)) == "copertura_parziale"
            )
            if barricades:
                stat = data.get("pa_stat")
                if stat not in (char.stats or {}) or isinstance((char.stats or {}).get(stat), dict):
                    reject("barricade_stat")
                    return
                needed = BARRICADE_PA_COST * barricades
                if stat_pa_current(char, stat) < needed:
                    reject("barricade_pa")
                    return
                barricade_cost = (stat, needed)

        # In combattimento il movimento costa frame, calcolati qui e non dal client.
        # Il Master può comunque riposizionare liberamente (senza andatura).
        move_cost = None
        in_combat = combat_state.get("is_active") and any(
            int(entry.get("id", -1)) == char.id for entry in combat_state.get("turn_order", [])
        )

        if in_combat:
            if not is_players_turn(char):
                reject("not_your_turn")
                return

            if mode in MOVE_FRAME_COSTS:
                steps = hex_distance(char.pos_x, char.pos_y, target_x, target_y)
                move_cost = movement_frame_cost(
                    ws, hex_line(char.pos_x, char.pos_y, target_x, target_y), MOVE_FRAME_COSTS[mode]
                )
                frames = int(combat_state["players_pa"].get(str(char.id), DEFAULT_MOVE_FRAMES))

                if move_cost > frames:
                    reject("frames")
                    return
            elif not is_master_request():
                reject("frames")
                return

        walked_path = hex_line(char.pos_x, char.pos_y, target_x, target_y)

        if barricade_cost:
            stat, needed = barricade_cost
            pa_stats = dict(char.pa_stats or {})
            pa_stats[stat] = stat_pa_current(char, stat) - needed
            char.pa_stats = pa_stats

        char.pos_x = target_x
        char.pos_y = target_y
        db.session.commit()

        if move_cost is not None:
            combat_state["players_pa"][str(char.id)] = frames - move_cost

        # Superfici attraversate: il Master decide se applicarne l'effetto
        entered_surfaces = []
        for hx, hy in walked_path[1:]:
            surface = (ws.surfaces or {}).get(hex_key(hx, hy))
            if surface in SURFACE_EFFECTS and SURFACE_EFFECTS[surface]["effect"] and surface not in entered_surfaces:
                entered_surfaces.append(surface)

    # Il movimento può essere stato accorciato da una minaccia
    emit_character_update(char, {"_move_id": move_id, "_stopped_by_threat": bool(triggered_threats)})

    if move_cost is not None:
        socketio.emit("sync_pa", {"char_id": char.id, "pa": frames - move_cost})
        socketio.emit("dice_result", {
            "name": char.name,
            "message": (
                f"si sposta di <b>{steps} passi</b> ({html.escape(mode)}) "
                f"consumando <b>{move_cost} Frame</b> movimento."
            ),
            "is_master_roll": False
        })

    # Chi si muove perde la mira; e chi si sposta può uscire dalla vista di altri
    if (char.pos_x, char.pos_y) != (walked_path[0][0], walked_path[0][1]):
        break_aims(lambda aim: aim["shooter_id"] == char.id, "si è mosso")
    check_aims()

    if triggered_threats:
        start_threat_interrupts(char, triggered_threats)

    if barricade_cost:
        socketio.emit("dice_result", {
            "name": char.name,
            "message": f"🧱 scavalca la barricata spendendo <b>{barricade_cost[1]} PA</b> di {html.escape(barricade_cost[0])}.",
            "is_master_roll": False
        })

    for surface in entered_surfaces:
        prompt_surface_effect(char, surface, "enter")

@socketio.on("spawn_npc")
def handle_spawn_npc(data):
    if request.sid not in master_sids:
        return

    try:
        target_x = int(data.get("x", 0))
        target_y = int(data.get("y", 0))
    except (TypeError, ValueError):
        return

    with movement_lock:
        occupied = Character.query.filter(
            Character.pos_x == target_x,
            Character.pos_y == target_y
        ).first()

        if occupied:
            emit("spawn_rejected", {
                "reason": "occupied",
                "x": target_x,
                "y": target_y
            })
            return

        new_npc = Character(
            name=clean_character_name(data.get("name")) or "Mostro",
            role="npc",
            pos_x=target_x,
            pos_y=target_y,
            color=data.get("color", "#000000"),
            hp_max=data.get("hp", 30),
            hp_current=data.get("hp", 30),
            stats={"Tipo": "NPC / Nemico"}, weapons=[], skills=[], backpack=[], xp=0, shop=[],
            is_hidden=data.get("is_hidden", False),
            token_url=data.get("token_url", ""),
            lore=str(data.get("lore", "")).strip()
        )

        # Da un modello: tutto il resto della scheda arriva dal modello.
        # Nome, HP, colore, descrizione e pedina restano quelli del modulo di spawn.
        template = db.session.get(NpcTemplate, data.get("template_id")) if data.get("template_id") else None
        if template:
            apply_npc_template(new_npc, template.data or {})
            new_npc.name = unique_character_name(new_npc.name)
            new_npc.spawn_sound = copy.deepcopy((template.data or {}).get("sound"))

        db.session.add(new_npc)
        db.session.commit()
    emit_character_update(new_npc)

# ==========================================
# MODELLI NPC
# ==========================================
NPC_TEMPLATE_FIELDS = (
    "color", "hp_max", "stamina_max", "conc_max", "stats", "weapons", "skills",
    "backpack", "bonuses", "lore", "photo_url", "token_url", "status"
)

def fresh_equipment(value):
    """Copia profonda dell'equipaggiamento con la durabilità di nuovo al massimo."""
    if isinstance(value, dict):
        return {
            key: fresh_equipment(item)
            for key, item in value.items()
            if key != "durability_current"
        }
    if isinstance(value, list):
        return [fresh_equipment(item) for item in value]
    return value

def snapshot_npc_template(char):
    return {field: fresh_equipment(getattr(char, field)) for field in NPC_TEMPLATE_FIELDS}

def apply_npc_template(char, data):
    for field in NPC_TEMPLATE_FIELDS:
        # Nome, HP, colore, descrizione e pedina li ha già decisi il modulo di spawn
        if field in ("color", "lore", "token_url", "hp_max") and getattr(char, field):
            continue
        if field in data and data[field] is not None:
            setattr(char, field, fresh_equipment(data[field]))

    char.hp_current = char.hp_max
    char.stamina_current = char.stamina_max
    char.conc_current = char.conc_max

def unique_character_name(name):
    """Più copie dello stesso modello: "Bandito", "Bandito 2", "Bandito 3"..."""
    existing = {c.name for c in Character.query.with_entities(Character.name).all()}
    if name not in existing:
        return name

    number = 2
    while f"{name} {number}" in existing:
        number += 1
    return f"{name} {number}"

def get_npc_template_list():
    templates = NpcTemplate.query.order_by(NpcTemplate.name).all()
    result = []

    for template in templates:
        data = template.data or {}
        equipped = (data.get("stats") or {}).get("equipped") or {}
        result.append({
            "id": template.id,
            "name": template.name,
            "hp_max": data.get("hp_max"),
            "color": data.get("color"),
            "lore": data.get("lore") or "",
            "token_url": data.get("token_url") or "",
            "weapons": len(data.get("weapons") or []),
            "equipped": len([item for item in equipped.values() if item]),
            "sound": data.get("sound")
        })

    return result

@socketio.on("save_npc_template")
def handle_save_npc_template(data):
    if not is_master_request():
        return

    data = data or {}
    char = db.session.get(Character, data.get("char_id"))
    name = clean_character_name(data.get("name")) or (char.name if char else "")

    if not char or char.role == "master" or not name:
        return

    # Stesso nome: il modello viene aggiornato
    template = NpcTemplate.query.filter_by(name=name).first()
    if template is None:
        template = NpcTemplate(name=name)
        db.session.add(template)

    previous_sound = (template.data or {}).get("sound")
    template.data = snapshot_npc_template(char)
    template.data["sound"] = copy.deepcopy(char.spawn_sound) or previous_sound
    flag_modified(template, "data")
    db.session.commit()

    emit_to_masters("npc_template_list", get_npc_template_list())
    emit("dice_result", {
        "name": "SISTEMA",
        "message": f"📋 Modello NPC <b>{html.escape(name)}</b> salvato.",
        "is_master_roll": True
    }, to=request.sid)

@socketio.on("set_template_sound")
def handle_set_template_sound(data):
    """Suono del modello: nuovo file, solo il pubblico (tutti / solo Master) o nessun suono."""
    # Risponde sempre al client (ack): così il Master sa se il suono è stato salvato
    if not is_master_request():
        return {"error": "Solo il Master può impostare i suoni."}
    data = data or {}
    template = db.session.get(NpcTemplate, data.get("template_id"))
    if not template:
        return {"error": "Modello NPC non trovato."}

    sound = copy.deepcopy((template.data or {}).get("sound"))
    scope = "master" if data.get("scope") == "master" else "all"
    if data.get("remove"):
        sound = None
    elif data.get("data_url"):
        url, error = save_sound_data_url(data["data_url"])
        if error:
            emit_combat_error(error)
            return {"error": error}
        sound = {"url": url, "scope": scope, "template_id": template.id}
    elif sound:
        sound["scope"] = scope
    else:
        return {"error": "Nessun suono da salvare."}

    template.data = {**(template.data or {}), "sound": sound}
    flag_modified(template, "data")

    # Anche gli NPC già in mappa di quel modello? No: solo quelli spawnati da ora.
    # Se il Master vuole aggiornarli c'è il flag "apply_to_spawned".
    if data.get("apply_to_spawned"):
        for npc in Character.query.filter(Character.role == "npc").all():
            if (npc.spawn_sound or {}).get("template_id") == template.id or npc.name.rstrip("0123456789 ") == template.name:
                npc.spawn_sound = copy.deepcopy(sound)
                emit_character_update(npc)

    db.session.commit()
    emit_to_masters("npc_template_list", get_npc_template_list())
    emit("dice_result", {
        "name": "SISTEMA",
        "message": f"🔊 Suono del modello <b>{html.escape(template.name)}</b> " + ("rimosso." if not sound else "salvato."),
        "is_master_roll": True
    }, to=request.sid)
    return {"ok": True, "sound": sound}

@socketio.on("delete_npc_template")
def handle_delete_npc_template(data):
    if not is_master_request():
        return

    template = db.session.get(NpcTemplate, (data or {}).get("id"))
    if not template:
        return

    db.session.delete(template)
    db.session.commit()
    emit_to_masters("npc_template_list", get_npc_template_list())

@socketio.on("update_vitals")
@undoable("Modifica dei vitali")
def handle_update_vitals(data):
    # I vitali dal pannello Entità sono controlli amministrativi del Master.
    if request.sid not in master_sids:
        return

    char_id = data.get("char_id")
    char = db.session.get(Character, char_id)
    if not char:
        return

    try:
        if "hp" in data:
            char.hp_current = max(0, min(char.hp_max, char.hp_current + int(data["hp"])))
        if "stamina" in data:
            char.stamina_current = max(0, min(char.stamina_max, char.stamina_current + int(data["stamina"])))
        if "conc" in data:
            char.conc_current = max(0, min(char.conc_max, char.conc_current + int(data["conc"])))
    except (TypeError, ValueError):
        return

    if "status" in data:
        char.status = str(data["status"])

    db.session.commit()
    emit_character_update(char)

@socketio.on("spend_pa")
@undoable("Spesa di PA")
def handle_spend_pa(data):
    char_id = data.get("char_id")
    stat_key = data.get("stat")
    amount = int(data.get("amount", 1))

    char = db.session.get(Character, char_id)
    if not controls_character(char): return

    current_pa_stats = dict(char.pa_stats) if char.pa_stats else {}
    if stat_key not in current_pa_stats:
        stat_val = int(char.stats.get(stat_key, 1))
        current_pa_stats[stat_key] = 6 + (stat_val - 1) * 3

    if current_pa_stats[stat_key] > 0 and amount > 0:
        actual_spent = min(amount, current_pa_stats[stat_key])
        current_pa_stats[stat_key] -= actual_spent
        char.pa_stats = current_pa_stats

        db.session.commit()
        emit_character_update(char)
        emit("dice_result", {"name": char.name, "message": f"ha speso {actual_spent} PA di <b>{stat_key}</b>.", "is_master_roll": False}, broadcast=True)

@socketio.on("reset_pa")
@undoable("Ricarica PA")
def handle_reset_pa(data):
    char_id = data.get("char_id")
    stat_key = data.get("stat")
    cost_type = data.get("cost_type")

    char = db.session.get(Character, char_id)
    if not controls_character(char): return

    can_reset = False
    if cost_type == "stamina" and char.stamina_current >= 15:
        char.stamina_current -= 15
        can_reset = True
        msg_cost = "Stamina ⚡"
    elif cost_type == "conc" and char.conc_current >= 15:
        char.conc_current -= 15
        can_reset = True
        msg_cost = "Concentrazione 🧠"

    if can_reset:
        current_pa_stats = dict(char.pa_stats) if char.pa_stats else {}
        stat_val = int(char.stats.get(stat_key, 1))
        current_pa_stats[stat_key] = 6 + (stat_val - 1) * 3
        char.pa_stats = current_pa_stats

        db.session.commit()
        emit_character_update(char)
        emit("dice_result", {"name": char.name, "message": f"ha speso 15 {msg_cost} per ripristinare i PA di <b>{stat_key}</b>!", "is_master_roll": False}, broadcast=True)

@socketio.on("master_set_bank")
def handle_master_set_bank(data):
    # Modifica amministrativa del conto: solo il Master può impostare il saldo.
    if request.sid not in master_sids:
        return

    char = db.session.get(Character, data.get("char_id"))
    if not char or char.role != "player":
        return

    try:
        # Nessun clamp a zero: il conto può andare in negativo.
        char.xp = int(data.get("value", 0))
    except (TypeError, ValueError):
        return

    db.session.commit()
    emit_character_update(char)

@socketio.on("update_xp")
def handle_update_xp(data):
    char = db.session.get(Character, data.get("char_id"))
    if not controls_character(char): return
    try:
        amount = int(data.get("amount", 0))
        # I giocatori possono solo spendere (acquisti nel negozio); dare soldi spetta al Master
        if not is_master_request() and (amount > 0 or char.xp + amount < 0): return
        char.xp = max(0, char.xp + amount)
        db.session.commit()
        emit_character_update(char)
    except (TypeError, ValueError): return

@socketio.on("delete_character")
def handle_delete_character(data):
    char = db.session.get(Character, data.get("char_id"))
    if char and char.role == "npc" and request.sid not in master_sids:
        return
    if char and char.role != "master":
        db.session.delete(char)
        db.session.commit()
        emit("character_deleted", {"id": data.get("char_id")}, broadcast=True)

@socketio.on("toggle_hidden")
def handle_toggle_hidden(data):
    if not is_master_request():
        return

    char = db.session.get(Character, data.get("char_id"))
    if char and char.role != "master":
        char.is_hidden = bool(data.get("is_hidden", False))
        db.session.commit()
        emit("character_hidden_update", {"id": char.id, "is_hidden": char.is_hidden}, broadcast=True)

@socketio.on("update_character_sheet")
def handle_update_character_sheet(data):
    char = db.session.get(Character, data.get("char_id"))
    if not controls_character(char): return
    if "photo_url" in data: char.photo_url = data["photo_url"]
    if "token_url" in data: char.token_url = data["token_url"]
    if "lore" in data: char.lore = data["lore"]
    if "stats" in data: char.stats = data["stats"]
    if "weapons" in data: char.weapons = data["weapons"]
    if "skills" in data: char.skills = data["skills"]
    if "backpack" in data: char.backpack = data["backpack"]
    if "bonuses" in data: char.bonuses = data["bonuses"]
    if "shop" in data: char.shop = data["shop"]
    if "notes" in data: char.notes = data["notes"]
    if "knowledge" in data: char.knowledge = clean_knowledge(data["knowledge"])
    if "stats" in data or "backpack" in data: auto_load_new_firearms(char)
    if "stats" in data: check_aims()
    db.session.commit()
    emit_character_update(char)

# ==========================================
# MUNIZIONI E CARICATORI
# Un'arma da fuoco (compendio con weapon.ammo) ha un caricatore: si carica
# con proiettili dello zaino che citano il suo calibro o il suo nome,
# ogni colpo ne usa uno, a vuoto non si spara. Ricaricare in combattimento
# costa i frame di "Cambiare caricatore" della tabella azioni.
# ==========================================
PROJECTILE_PATTERN = re.compile(r"\b(proiettil\w*|munizion\w*|fmj|pallettoni|cartucc\w*|bossol\w*)\b", re.IGNORECASE)

def firearm_spec(comp):
    """(calibro, capienza) per un'arma da fuoco, altrimenti None."""
    ammo = ((comp or {}).get("weapon") or {}).get("ammo") or {}
    try:
        capacity = int(ammo.get("capacity") or 0)
    except (TypeError, ValueError):
        capacity = 0
    return (str(ammo.get("type") or ""), capacity) if capacity > 0 else None

def equipped_item_compendium(item):
    if isinstance(item.get("custom_definition"), dict):
        return item["custom_definition"]
    return get_compendium_item(compendium_id=item.get("compendium_id"), name=item.get("name"))

def projectile_fits(entry, comp, gun_name):
    """Il proiettile deve citare il calibro dell'arma o il suo nome (es. "9mm", "revolver")."""
    text = f"{entry.get('name', '')} {entry.get('desc', '')}".lower()
    if not PROJECTILE_PATTERN.search(text):
        return False
    caliber = (firearm_spec(comp) or ("", 0))[0].lower()
    keys = {caliber, str(comp.get("name", "")).lower(), str(gun_name or "").lower()}
    return any(key and key in text for key in keys)

# Munizioni "globali" degli NPC: un'unica scorta per NPC, buona per qualsiasi
# arma da fuoco (niente calibro). Sta nello zaino come voce speciale, così
# passa anche ai modelli NPC; si ricarica dal caricatore come per i giocatori.
NPC_AMMO_NAME = "Munizioni NPC"

def npc_ammo_index(char):
    return next(
        (i for i, e in enumerate(char.backpack or []) if isinstance(e, dict) and e.get("npc_ammo")),
        None
    )

def compatible_ammo(char, comp, gun_name):
    fitting = []
    for index, entry in enumerate(char.backpack or []):
        if not isinstance(entry, dict) or int(entry.get("qty", 1) or 0) <= 0:
            continue
        if entry.get("npc_ammo"):
            if char.role == "npc":
                fitting.insert(0, (index, entry))   # la scorta globale per prima
        elif projectile_fits(entry, comp, gun_name):
            fitting.append((index, entry))
    return fitting

def return_ammo_to_backpack(backpack, loaded):
    """I colpi tolti dal caricatore tornano nello zaino (si sommano se c'è già la voce)."""
    if loaded.get("npc_ammo"):
        pool = next((e for e in backpack if isinstance(e, dict) and e.get("npc_ammo")), None)
        if pool is None:
            backpack.append({"name": NPC_AMMO_NAME, "qty": loaded["count"], "desc": "Munizioni globali dell'NPC", "npc_ammo": True})
        else:
            pool["qty"] = int(pool.get("qty", 0) or 0) + loaded["count"]
        return
    for entry in backpack:
        if isinstance(entry, dict) and not entry.get("npc_ammo") and entry.get("name", "").lower() == loaded["name"].lower():
            entry["qty"] = int(entry.get("qty", 0) or 0) + loaded["count"]
            return
    backpack.append({"name": loaded["name"], "qty": loaded["count"], "desc": loaded.get("desc", "")})

def set_loaded_ammo(char, slot, loaded):
    """Scrive il caricatore su tutti gli slot dell'arma (anche a due mani)."""
    stats = copy.deepcopy(char.stats or {})
    equipped = stats.get("equipped") or {}
    group = (equipped.get(slot) or {}).get("equip_group_id")
    for key, item in equipped.items():
        if isinstance(item, dict) and (key == slot or (group and item.get("equip_group_id") == group)):
            item["ammo_loaded"] = loaded
    char.stats = stats
    flag_modified(char, "stats")

def load_firearm(char, slot, ammo_index):
    """Carica l'arma con i proiettili scelti. Restituisce (caricati, nome) oppure un errore (str)."""
    item = ((char.stats or {}).get("equipped") or {}).get(slot)
    comp = equipped_item_compendium(item) if isinstance(item, dict) else None
    spec = firearm_spec(comp)
    if not spec:
        return "Quest'arma non usa munizioni."

    fitting = dict(compatible_ammo(char, comp, item.get("name")))
    if ammo_index not in fitting:
        return f"Questi proiettili non vanno bene per {item.get('name')}."

    backpack = copy.deepcopy(char.backpack or [])
    entry = backpack[ammo_index]
    loaded_name, loaded_desc = entry.get("name", "Proiettili"), entry.get("desc", "")
    is_pool = bool(entry.get("npc_ammo"))

    # Scorta globale: i colpi rimasti nell'arma tornano prima nella scorta,
    # così il caricatore si riempie fino in fondo
    previous = item.get("ammo_loaded") or {}
    if is_pool and previous.get("npc_ammo") and previous.get("count"):
        entry["qty"] = int(entry.get("qty", 0) or 0) + int(previous["count"])
        previous = {}
    take = min(spec[1], int(entry.get("qty", 1) or 1))

    entry["qty"] = int(entry.get("qty", 1) or 1) - take
    # La scorta globale resta anche a zero: il Master la vede e la riempie
    if entry["qty"] <= 0 and not is_pool:
        backpack.pop(ammo_index)

    # Quello che c'era nel caricatore torna nello zaino
    if previous.get("count"):
        return_ammo_to_backpack(backpack, previous)

    char.backpack = backpack
    flag_modified(char, "backpack")
    loaded = {"name": loaded_name, "desc": loaded_desc, "count": take}
    if is_pool:
        loaded["npc_ammo"] = True
    set_loaded_ammo(char, slot, loaded)
    return take, loaded_name

def auto_load_new_firearms(char):
    """Un'arma da fuoco appena equipaggiata si carica da sola con i primi proiettili adatti."""
    for slot, item in list(((char.stats or {}).get("equipped") or {}).items()):
        if not isinstance(item, dict) or "ammo_loaded" in item:
            continue
        comp = equipped_item_compendium(item)
        if not firearm_spec(comp):
            continue
        fitting = compatible_ammo(char, comp, item.get("name"))
        if fitting:
            load_firearm(char, slot, fitting[0][0])
        else:
            # Segna l'arma come vista: resta scarica finché non si ricarica
            set_loaded_ammo(char, slot, {"name": None, "desc": "", "count": 0})

@socketio.on("set_npc_ammo")
@undoable("Munizioni NPC")
def handle_set_npc_ammo(data):
    """Il Master imposta la scorta globale di colpi di un NPC."""
    if not is_master_request():
        return
    data = data or {}
    char = db.session.get(Character, data.get("char_id"))
    if not char or char.role != "npc":
        return
    try:
        count = max(0, min(9999, int(data.get("count"))))
    except (TypeError, ValueError):
        return

    backpack = copy.deepcopy(char.backpack or [])
    index = npc_ammo_index(char)
    if index is None:
        backpack.append({"name": NPC_AMMO_NAME, "qty": count, "desc": "Munizioni globali dell'NPC", "npc_ammo": True})
    else:
        backpack[index]["qty"] = count
    char.backpack = backpack
    flag_modified(char, "backpack")

    # Armi mai caricate si caricano subito; un caricatore svuotato sparando va
    # ricaricato con la solita azione (frame in combattimento)
    if count:
        for slot, item in list(((char.stats or {}).get("equipped") or {}).items()):
            if not isinstance(item, dict) or (item.get("ammo_loaded") or {}).get("name"):
                continue
            comp = equipped_item_compendium(item)
            if firearm_spec(comp) and npc_ammo_index(char) is not None and int(char.backpack[npc_ammo_index(char)].get("qty", 0)) > 0:
                load_firearm(char, slot, npc_ammo_index(char))

    db.session.commit()
    emit_character_update(char)
    emit("dice_result", {
        "name": "SISTEMA",
        "message": f"🎯 Munizioni globali di <b>{html.escape(char.name)}</b>: {count} colpi di scorta.",
        "is_master_roll": True
    }, to=request.sid)

@socketio.on("load_weapon")
@undoable("Ricarica")
def handle_load_weapon(data):
    data = data or {}
    char = db.session.get(Character, data.get("char_id"))
    if not controls_character(char):
        return

    slot = data.get("slot")
    item = ((char.stats or {}).get("equipped") or {}).get(slot)
    if not isinstance(item, dict):
        return

    try:
        ammo_index = int(data.get("ammo_index"))
    except (TypeError, ValueError):
        return

    # Prima si controlla arma e proiettili, poi (in combattimento) si pagano i frame
    comp = equipped_item_compendium(item)
    if not firearm_spec(comp):
        emit_combat_error("Quest'arma non usa munizioni.")
        return
    if ammo_index not in dict(compatible_ammo(char, comp, item.get("name"))):
        pool = (char.backpack or [])[ammo_index] if 0 <= ammo_index < len(char.backpack or []) else {}
        if char.role == "npc" and isinstance(pool, dict) and pool.get("npc_ammo"):
            emit_combat_error(f"{char.name} ha finito le munizioni globali.")
        else:
            emit_combat_error(f"Questi proiettili non vanno bene per {item.get('name')}.")
        return

    # In combattimento ricaricare è un'azione: nel proprio turno, pagando i frame
    cost_text = ""
    if combat_state.get("is_active") and any(int(e.get("id", -1)) == char.id for e in combat_state.get("turn_order", [])):
        if not is_players_turn(char):
            emit_combat_error("Puoi ricaricare solo nel tuo turno.")
            return
        kind = "pistola" if any(k in str((comp or {}).get("name", item.get("name"))).lower() for k in ("pistol", "revolver")) else "fucile"
        rule = get_action_speed_rule(f"Cambiare caricatore {kind}")
        cost = int((rule or {}).get("frames", 0))
        if cost:
            # Si ricarica a due mani: paga prima il braccio dell'arma, il resto l'altro
            gun_arm = SLOT_COMBAT_LIMBS.get(slot, "bd")
            other_arm = "bs" if gun_arm == "bd" else "bd"
            first = min(cost, get_limb_frames(char.id)[gun_arm])
            shares = {gun_arm: first, other_arm: cost - first}
            limb_error = spend_limb_frames(char.id, shares, cost)
            if limb_error:
                emit_combat_error(limb_error)
                return
            cost_text = f" (<b>{cost} Frame</b>)"

    result = load_firearm(char, slot, ammo_index)
    if isinstance(result, str):
        emit_combat_error(result)
        return

    db.session.commit()
    emit_character_update(char)

    count, ammo_name = result
    socketio.emit("dice_result", {
        "name": char.name,
        "message": f"🔄 ricarica <b>{html.escape(str(item.get('name')))}</b> con <b>{html.escape(str(ammo_name))}</b>: {count} colpi{cost_text}.",
        "is_master_roll": False
    })

def clean_knowledge(raw):
    """Conoscenze: solo nome e descrizione, testo semplice."""
    entries = []
    for entry in raw if isinstance(raw, list) else []:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name", "")).strip()[:80]
        if name:
            entries.append({"name": name, "desc": str(entry.get("desc", "")).strip()[:500]})
    return entries[:100]

# ==========================================
# ABILITÀ DEI GADGET
# Un gadget comprato mostra la sua abilità nella scheda; si usa quando
# è equipaggiato (o subito, se non ha uno slot). Usarla la annuncia in
# chat e spende i PA scritti nel compendio.
# ==========================================
GADGET_EXCLUDED_CLASSES = {"Arma", "Licenza", "Kit", "Munizione / consumabile", "Armatura"}
# Codici di costo del compendio -> statistica di cui si spendono i PA ("PA" la sceglie il giocatore)
GADGET_PA_STATS = {"PAA": "Arguzia", "PAV": "Volontà", "PAP": "Percezione"}

def stat_pa_current(char, stat):
    pa_stats = char.pa_stats or {}
    if stat in pa_stats:
        return int(pa_stats[stat])
    try:
        stat_val = int((char.stats or {}).get(stat, 1))
    except (TypeError, ValueError):
        stat_val = 1
    return 6 + (stat_val - 1) * 3

def char_owned_items(char):
    """Oggetti posseduti: zaino, equipaggiamento e gadget equipaggiati."""
    stats = char.stats or {}
    equipped = [v for v in (stats.get("equipped") or {}).values() if isinstance(v, dict)]
    gadgets = [v for v in (stats.get("equipped_gadgets") or {}).values() if isinstance(v, dict)]
    backpack = [v for v in (char.backpack or []) if isinstance(v, dict)]
    return backpack, equipped + gadgets

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

@socketio.on("buy_skill")
def handle_buy_skill(data):
    char = db.session.get(Character, data.get("char_id"))
    if not controls_character(char): return

    skill_name = data.get("skill_name")

    # Il prezzo viene dal negozio del personaggio, non dal client
    shop_item = next(
        (item for item in (char.shop or []) if isinstance(item, dict) and item.get("name") == skill_name),
        None
    )
    if not shop_item and not is_master_request(): return
    try:
        cost = int((shop_item or {}).get("cost", data.get("cost", 0)))
    except (TypeError, ValueError):
        return

    current_skills = list(char.skills) if char.skills else []
    if char.xp < cost or not skill_name or skill_name in current_skills: return

    char.xp -= cost
    if "Nessuna abilità" in current_skills: current_skills.remove("Nessuna abilità")
    current_skills.append(skill_name)
    char.skills = current_skills

    if data.get("stat_bonus") and isinstance(char.stats, dict):
        current_stats = dict(char.stats)
        stat_key = data["stat_bonus"].get("stat")
        if stat_key in current_stats:
            current_stats[stat_key] = int(current_stats[stat_key]) + int(data["stat_bonus"].get("val", 0))
            char.stats = current_stats

    db.session.commit()
    emit_character_update(char)

def load_compendio():
    path = os.path.join(app.root_path, "compendio.json")
    if not os.path.exists(path): return {}
    try:
        with open(path, "r", encoding="utf-8") as f: compendio = json.load(f)
    except (json.JSONDecodeError, OSError): return {}

    # Aggiunte del Master salvate nel database: non si perdono se il
    # compendio viene rigenerato dal foglio di calcolo
    items = compendio.setdefault("items", [])
    items.extend(custom.data for custom in CustomCompendiumItem.query.all())

    overrides = {o.compendium_id: o.cost_eur for o in ItemPriceOverride.query.all()}
    for item in items:
        if item.get("id") in overrides:
            item.setdefault("equipment", {})["cost_eur"] = overrides[item["id"]]

    return compendio

# Oggetti creati dal Master nel Listino
CUSTOM_ITEM_CLASSES = {"Gadget", "Armatura", "Arma", "Kit", "Munizione / consumabile", "Licenza"}
EQUIPMENT_SLOTS = [
    "elmo", "schiena", "spalla_dx", "spalla_sx", "petto", "avambr_dx", "avambr_sx",
    "cintura", "guanto_dx", "guanto_sx", "gambe", "stivale_dx", "stivale_sx"
]

def build_custom_item(item_id, data, previous=None):
    """Voce di compendio con la stessa forma di quelle generate dal foglio di calcolo."""
    item = copy.deepcopy(previous) if previous else {
        "id": item_id,
        "text": {},
        "equipment": {"slot": {}, "weight": 0, "harmonization": 0, "hp": None},
        "requirements": {"raw": None, "items": [], "limitations": None},
        "activation": {"mode": None, "speed": {}, "cost": {}, "condition": None},
        "combat": {"damage": {}, "range": {}, "area": {}},
        "resource": {},
        "effects": {},
        "source": {"origin": "master"}
    }

    item["name"] = str(data.get("name", "")).strip()[:120]
    item["brand"] = str(data.get("brand", "")).strip()[:60] or None
    item["class"] = data.get("class") if data.get("class") in CUSTOM_ITEM_CLASSES else "Gadget"
    item["type"] = item.get("type") or item["class"]
    item["text"] = {
        "description": str(data.get("description", "")).strip()[:3000] or None,
        "original_rules": None,
        "effect_summary": None
    }

    try:
        cost = None if data.get("cost") in (None, "") else max(0, int(data.get("cost")))
    except (TypeError, ValueError):
        cost = None
    item["equipment"]["cost_eur"] = cost

    # "any" = qualsiasi slot (come i foderi), altrimenti uno slot preciso o nessuno
    slot = data.get("slot") or ""
    allowed = EQUIPMENT_SLOTS if slot == "any" else [slot] if slot in EQUIPMENT_SLOTS else []
    item["equipment"]["slot"] = {
        "raw": slot or None, "family": None, "position": None,
        "count": 1, "allowed_slots": allowed, "occupancy": "one"
    }
    return item

@socketio.on("save_custom_item")
def handle_save_custom_item(data):
    if not is_master_request():
        return

    data = data or {}
    if not str(data.get("name", "")).strip():
        return

    custom = db.session.get(CustomCompendiumItem, data.get("id")) if data.get("id") else None

    if custom is None:
        # Nuovo id progressivo che non si scontra con quelli del compendio
        existing = {c.id for c in CustomCompendiumItem.query.all()}
        number = 1
        while f"MASTER-{number:03d}" in existing:
            number += 1
        custom = CustomCompendiumItem(id=f"MASTER-{number:03d}")
        db.session.add(custom)

    custom.data = build_custom_item(custom.id, data, custom.data)
    flag_modified(custom, "data")

    # Il prezzo scritto nel modulo vale più di una vecchia modifica al volo
    override = db.session.get(ItemPriceOverride, custom.id)
    if override:
        db.session.delete(override)

    db.session.commit()
    socketio.emit("compendio_data", load_compendio())

@socketio.on("delete_custom_item")
def handle_delete_custom_item(data):
    if not is_master_request():
        return

    custom = db.session.get(CustomCompendiumItem, (data or {}).get("id"))
    if not custom:
        return

    override = db.session.get(ItemPriceOverride, custom.id)
    if override:
        db.session.delete(override)
    db.session.delete(custom)
    db.session.commit()
    socketio.emit("compendio_data", load_compendio())

@socketio.on("set_item_price")
def handle_set_item_price(data):
    """Il Master cambia il prezzo di un oggetto del mercato al volo."""
    if not is_master_request():
        return

    data = data or {}
    compendium_id = str(data.get("compendium_id") or "")
    if not get_compendium_item(compendium_id=compendium_id):
        return

    raw_price = data.get("price")
    try:
        price = None if raw_price in (None, "") else max(0, int(raw_price))
    except (TypeError, ValueError):
        return

    override = db.session.get(ItemPriceOverride, compendium_id) or ItemPriceOverride(compendium_id=compendium_id)
    override.cost_eur = price
    db.session.merge(override)
    db.session.commit()

    # Tutti vedono subito il nuovo prezzo nel mercato
    socketio.emit("compendio_data", load_compendio())

@socketio.on("get_compendio")
def handle_get_compendio():
    emit("compendio_data", load_compendio())

# ==========================================
# HELPERS COMBATTIMENTO / COMPENDIO V2
# ==========================================
def get_compendium_item(compendium_id=None, name=None):
    compendio = load_compendio()
    items = compendio.get("items", []) if isinstance(compendio, dict) else []

    if compendium_id:
        for item in items:
            if item.get("id") == compendium_id:
                return item

    if name:
        wanted = str(name).strip().casefold()
        for item in items:
            current_name = str(item.get("name", "")).strip().casefold()
            if current_name == wanted:
                return item

    return None

def get_action_speed_rule(action_name):
    """Restituisce una voce della tabella velocità azioni del compendio."""
    if not action_name:
        return None

    compendio = load_compendio()
    table = (
        compendio.get("action_speed_table", {})
        if isinstance(compendio, dict)
        else {}
    )

    entries = (
        table.get("entries", [])
        if isinstance(table, dict)
        else table
    )

    if not isinstance(entries, list):
        return None

    wanted = str(action_name).strip().casefold()

    for entry in entries:
        if not isinstance(entry, dict):
            continue

        current = (
            str(entry.get("action", ""))
            .strip()
            .casefold()
        )

        if current == wanted:
            return entry

    return None


def character_owns_compendium_item(character, compendium_id=None, name=None):
    """Controlla zaino e lista armi senza dipendere dalla forma legacy dei dati."""
    if not character:
        return False

    wanted_name = str(name or "").strip().casefold()

    for collection in (character.backpack or [], character.weapons or []):
        for entry in collection:
            if isinstance(entry, str):
                if wanted_name and entry.strip().casefold() == wanted_name:
                    return True
                continue

            if not isinstance(entry, dict):
                continue

            if compendium_id and entry.get("compendium_id") == compendium_id:
                return True

            if wanted_name:
                current_name = str(entry.get("name", "")).strip().casefold()
                if current_name == wanted_name:
                    return True

    return False

def missing_weapon_license(character, comp_item):
    """Restituisce il nome della licenza mancante per le armi dei giocatori."""
    if not character or character.role != "player" or not comp_item:
        return None

    if comp_item.get("class") != "Arma":
        return None

    weapon_data = comp_item.get("weapon") or {}
    license_id = weapon_data.get("license_id")
    license_name = weapon_data.get("license_name")

    if not license_id and not license_name:
        return None

    if character_owns_compendium_item(
        character,
        compendium_id=license_id,
        name=license_name
    ):
        return None

    return license_name or license_id or "Licenza richiesta"

def cube_to_offset(q, r):
    col = q + (r - (r & 1)) // 2
    return col, r

def cube_round(q, r, s):
    rq, rr, rs = round(q), round(r), round(s)
    dq, dr, ds = abs(rq - q), abs(rr - r), abs(rs - s)
    if dq > dr and dq > ds:
        rq = -rr - rs
    elif dr > ds:
        rr = -rq - rs
    return rq, rr

def hex_line(x1, y1, x2, y2):
    """Esagoni attraversati andando in linea retta da (x1,y1) a (x2,y2), estremi inclusi."""
    a = offset_to_cube(int(x1), int(y1))
    b = offset_to_cube(int(x2), int(y2))
    steps = hex_distance(x1, y1, x2, y2)

    if steps == 0:
        return [(int(x1), int(y1))]

    line = []
    for i in range(steps + 1):
        t = i / steps
        # Piccola spinta per non cadere esattamente sui bordi tra due esagoni
        q = a[0] + (b[0] - a[0]) * t + 1e-6
        r = a[1] + (b[1] - a[1]) * t + 2e-6
        s = a[2] + (b[2] - a[2]) * t - 3e-6
        line.append(cube_to_offset(*cube_round(q, r, s)))
    return line

def offset_to_cube(col, row):
    """Conversione Odd-R identica a static/utils.js."""
    q = col - (row - (row & 1)) // 2
    r = row
    s = -q - r
    return q, r, s

def hex_distance(x1, y1, x2, y2):
    a = offset_to_cube(int(x1), int(y1))
    b = offset_to_cube(int(x2), int(y2))
    return max(
        abs(a[0] - b[0]),
        abs(a[1] - b[1]),
        abs(a[2] - b[2])
    )

def numeric_speed(value):
    if value is None or value == "":
        return None

    if isinstance(value, (int, float)):
        return int(value)

    match = re.search(r"-?\d+(?:[.,]\d+)?", str(value))
    if not match:
        return None

    return int(float(match.group(0).replace(",", ".")))

def compendium_attack_speed(item):
    if not item:
        return None

    speed = item.get("activation", {}).get("speed", {})
    raw = speed.get("effect_or_action")

    if raw is None:
        raw = speed.get("activation")

    return numeric_speed(raw)

def compendium_attack_range(item):
    if not item:
        return None

    combat = item.get("combat", {})
    raw_range = combat.get("range", {}).get("max_m")

    if raw_range not in (None, ""):
        try:
            return float(raw_range)
        except (TypeError, ValueError):
            pass

    item_type = str(item.get("type", "")).casefold()
    mode = str(item.get("activation", {}).get("mode", "")).casefold()

    if "corpo a corpo" in item_type or "colpo senz" in mode:
        return 1.0

    area = combat.get("area", {})
    shape = str(area.get("shape", "")).casefold()
    size = str(area.get("size", ""))

    if "cono" in shape or "linea" in shape:
        match = re.search(r"(\d+(?:[.,]\d+)?)\s*m", size, re.IGNORECASE)
        if match:
            return float(match.group(1).replace(",", "."))

    return None

def get_equipped_attack_item(character, source_slot=None, compendium_id=None, weapon_name=None):
    stats = character.stats or {}
    equipped = stats.get("equipped") or {}
    equipped_gadgets = stats.get("equipped_gadgets") or {}

    def matches(item):
        if not isinstance(item, dict):
            return False

        if compendium_id and item.get("compendium_id") == compendium_id:
            return True

        if weapon_name:
            current_name = str(item.get("name", "")).strip().casefold()
            wanted_name = str(weapon_name).strip().casefold()
            if current_name == wanted_name:
                return True

        return False

    if source_slot:
        for equipment_map in (equipped, equipped_gadgets):
            item = equipment_map.get(source_slot)
            if item and matches(item):
                return source_slot, item

    for equipment_map in (equipped, equipped_gadgets):
        for slot, item in equipment_map.items():
            if matches(item):
                return slot, item

    return None, None

def character_stat(character, stat_name):
    stats = character.stats or {}
    wanted = str(stat_name).strip().casefold()

    for key, value in stats.items():
        if str(key).strip().casefold() == wanted:
            try:
                return float(value)
            except (TypeError, ValueError):
                return 0.0

    return 0.0

def calculate_basic_damage(formula, attacker, weapon_name=""):
    """Calcola solo formule deterministiche semplici."""
    if not formula:
        unarmed = str(weapon_name).strip().casefold()
        if unarmed in {"pugno dx", "pugno sx", "mani nude"}:
            return 5
        return None

    text_formula = str(formula).strip()

    if re.fullmatch(r"clone\s*:\s*0", text_formula, re.IGNORECASE):
        return 0

    # Formule a fasce, somme o regole descrittive vengono gestite altrove/manuale.
    if (
        ";" in text_formula
        or "–" in text_formula
        or "dimezz" in text_formula.casefold()
        or "+" in text_formula
    ):
        return None

    clean = re.sub(r"\([^)]*\)", "", text_formula).strip()

    fixed = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*HP", clean, re.IGNORECASE)
    if fixed:
        return int(round(float(fixed.group(1).replace(",", "."))))

    clean = clean.replace("×", "*").replace("x", "*")
    parts = [part.strip() for part in clean.split("*") if part.strip()]

    if not parts:
        return None

    result = 1.0
    valid_stats = {
        "forza",
        "destrezza",
        "percezione",
        "arguzia",
        "volontà",
        "spirito",
        "virtù"
    }

    for part in parts:
        if re.fullmatch(r"\d+(?:[.,]\d+)?", part):
            result *= float(part.replace(",", "."))
            continue

        if part.casefold() in valid_stats:
            result *= character_stat(attacker, part)
            continue

        return None

    return int(round(result))

def resolve_attack_damage(comp_item, attacker, distance, weapon_name=""):
    """
    Risolve il danno che può essere determinato automaticamente.
    Le formule non deterministiche restano modificabili dal Master.
    """
    if not comp_item:
        basic_damage = calculate_basic_damage(None, attacker, weapon_name=weapon_name)
        return {
            "damage": basic_damage,
            "formula": "5" if basic_damage is not None else None,
            "note": None,
            "automatic": basic_damage is not None
        }

    compendium_id = comp_item.get("id")
    damage_data = comp_item.get("combat", {}).get("damage", {})
    raw_formula = damage_data.get("formula")

    # CRA-004 — GUANTI NUKEBULLET
    if compendium_id == "CRA-004":
        arguzia = character_stat(attacker, "Arguzia")

        if distance <= 3:
            damage = 10 * arguzia
            formula = "10×Arguzia"
        elif distance <= 6:
            damage = 4 * arguzia
            formula = "4×Arguzia"
        else:
            return {
                "damage": None,
                "formula": raw_formula,
                "note": "Bersaglio fuori dai 6 m del NukeBULLET.",
                "automatic": False
            }

        return {
            "damage": int(damage),
            "formula": formula,
            "note": (
                "Il bonus ×5 a contatto non è applicato automaticamente: "
                "serve una modalità di attacco 'Contatto'."
                if distance <= 1 else None
            ),
            "automatic": True
        }

    # CRA-006 — GUANTI NOT ORBITAL LASER
    if compendium_id == "CRA-006":
        arguzia = character_stat(attacker, "Arguzia")

        if distance > 50:
            return {
                "damage": 0,
                "formula": "Oltre 50 m: 0 danni",
                "note": "Dopo 50 m il fascio prosegue come luce e calore ma non infligge danni.",
                "automatic": True
            }

        divisions = 0 if distance <= 10 else math.ceil((distance - 10) / 10)
        base_damage = 20 * arguzia
        exact_damage = base_damage / (2 ** divisions)
        formula = "20×Arguzia" if divisions == 0 else f"(20×Arguzia) ÷ {2 ** divisions}"

        if not float(exact_damage).is_integer():
            return {
                "damage": None,
                "formula": formula,
                "note": f"Danno teorico: {exact_damage:g}. Serve definire la regola di arrotondamento.",
                "automatic": False
            }

        return {
            "damage": int(exact_damage),
            "formula": formula,
            "note": None,
            "automatic": True
        }

    # UMB-006 — TRINKET BOMBA: dipende dalla posizione della bomba, non dal lanciatore.
    if compendium_id == "UMB-006":
        return {
            "damage": None,
            "formula": raw_formula,
            "note": (
                "Il Trinket bomba richiede la distanza tra il bersaglio e la bomba piazzata; "
                "il danno va confermato dal Master."
            ),
            "automatic": False
        }

    basic_damage = calculate_basic_damage(raw_formula, attacker, weapon_name=weapon_name)

    return {
        "damage": basic_damage,
        "formula": raw_formula,
        "note": None if basic_damage is not None else "Formula non ancora automatizzata.",
        "automatic": basic_damage is not None
    }

def get_equipment_hp(item):
    if not isinstance(item, dict):
        return 0, 0

    comp_item = get_compendium_item(
        compendium_id=item.get("compendium_id"),
        name=item.get("name")
    )

    max_hp = item.get("durability_max")
    if max_hp is None and comp_item:
        max_hp = comp_item.get("equipment", {}).get("hp")

    try:
        max_hp = int(max_hp or 0)
    except (TypeError, ValueError):
        max_hp = 0

    current_hp = item.get("durability_current")
    if current_hp is None:
        current_hp = max_hp

    try:
        current_hp = int(current_hp or 0)
    except (TypeError, ValueError):
        current_hp = 0

    return current_hp, max_hp

def get_defense_equipment(character, limb_key):
    equipped = ((character.stats or {}).get("equipped") or {})

    priorities = {
        "bd": ["guanto_dx", "avambr_dx", "spalla_dx", "mano_dx"],
        "bs": ["guanto_sx", "avambr_sx", "spalla_sx", "mano_sx"],
        "gd": ["stivale_dx", "gambe"],
        "gs": ["stivale_sx", "gambe"]
    }

    fallback = (None, None)

    for slot in priorities.get(limb_key, []):
        item = equipped.get(slot)
        if not isinstance(item, dict):
            continue

        if fallback == (None, None):
            fallback = (slot, item)

        current_hp, max_hp = get_equipment_hp(item)
        if max_hp > 0 or current_hp > 0:
            return slot, item

    return fallback

def set_equipment_current_hp(character, slot_key, new_hp):
    stats = dict(character.stats or {})
    equipped = dict(stats.get("equipped") or {})
    item = equipped.get(slot_key)

    if not isinstance(item, dict):
        return

    group_id = item.get("equip_group_id")

    for key, equipped_item in list(equipped.items()):
        if not isinstance(equipped_item, dict):
            continue

        same_instance = key == slot_key

        if group_id:
            same_instance = equipped_item.get("equip_group_id") == group_id

        if same_instance:
            updated = dict(equipped_item)
            updated["durability_current"] = max(0, int(new_hp))
            equipped[key] = updated

    stats["equipped"] = equipped
    character.stats = stats
    flag_modified(character, "stats")

@socketio.on("add_skill_to_shop")
def handle_add_skill_to_shop(data):
    if not is_master_request():
        return

    char = db.session.get(Character, data.get("char_id"))
    skill_data = data.get("skill")
    if not char or not skill_data: return

    current_shop = list(char.shop) if char.shop else []
    if any(item.get("name") == skill_data.get("name") for item in current_shop): return

    current_shop.append(skill_data)
    char.shop = current_shop
    db.session.commit()
    emit_character_update(char)

@socketio.on("roll_dice")
def handle_roll_dice(data):
    char = db.session.get(Character, data.get("char_id")) if data.get("char_id") else None
    # Nessuno può tirare a nome di un personaggio altrui
    if char and not controls_character(char):
        char = None
    dice_expr = str(data.get("dice", "1d20")).lower().strip()[:20]
    is_master = is_master_request()

    name = html.escape(char.name) if char else "Sconosciuto"
    if is_master: name = f"👑 [MASTER] {name}"

    match = re.match(r"^(\d*)d(\d+)$", dice_expr)
    if match:
        num = min(int(match.group(1)) if match.group(1) else 1, 100)
        sides = min(int(match.group(2)), 1000)
        rolls = [random.randint(1, sides) for _ in range(num)]
        total = sum(rolls)
        detail = f" <span style='font-size:11px; color:#7f8c8d;'>({'+'.join(map(str, rolls))})</span>" if num > 1 else ""
        msg = f"ha tirato {num}d{sides}: <strong style='font-size:16px; color:#2c3e50;'>{total}</strong>{detail}"
    else:
        msg = f"ha provato a tirare '<i>{html.escape(dice_expr)}</i>', ma non è un formato valido."

    result_data = {"name": name, "message": msg, "is_master_roll": is_master}
    emit("dice_result", result_data, to=request.sid if is_master else None, broadcast=not is_master)

@socketio.on("chat_message")
def handle_chat_message(data):
    data = data or {}

    raw_message = str(data.get("message", "")).strip()
    if not raw_message:
        return

    raw_message = raw_message[:1200]

    role = client_roles.get(request.sid, "player")
    sender_char_id = client_character_ids.get(request.sid)

    if role == "master":
        sender_name = "👑 MASTER"
        sender_plain_name = "MASTER"
        is_master_message = True
    else:
        sender_char = db.session.get(Character, sender_char_id) if sender_char_id else None
        if not sender_char or sender_char.role != "player":
            emit(
                "chat_error",
                {"message": "Seleziona prima il tuo personaggio."},
                to=request.sid
            )
            return

        sender_name = html.escape(sender_char.name)
        sender_plain_name = sender_char.name
        is_master_message = False

    safe_message = html.escape(raw_message).replace("\n", "<br>")
    target = str(data.get("target", "all") or "all").strip().lower()

    # ======================================
    # CHAT GLOBALE
    # ======================================
    if target == "all":
        socketio.emit(
            "chat_message",
            {
                "name": sender_name,
                "message": safe_message,
                "is_master": is_master_message,
                "is_system": False,
                "channel": "global",
                "is_private": False,
                "target_label": "Tutti"
            }
        )
        return

    # ======================================
    # PRIVATO CON IL MASTER
    # ======================================
    if target == "master":
        if role == "master":
            emit(
                "chat_error",
                {"message": "Seleziona un giocatore come destinatario."},
                to=request.sid
            )
            return

        payload = {
            "name": sender_name,
            "message": safe_message,
            "is_master": False,
            "is_system": False,
            "channel": "private",
            "is_private": True,
            "target_label": "Master",
            "private_route": f"{html.escape(sender_plain_name)} → 👑 Master"
        }

        recipient_sids = set(master_sids)

        # Il mittente vede il proprio messaggio su tutte le sue sessioni.
        for sid, char_id in list(client_character_ids.items()):
            if char_id is not None and int(char_id) == int(sender_char_id):
                recipient_sids.add(sid)

        recipient_sids.add(request.sid)

        for sid in recipient_sids:
            socketio.emit("chat_message", payload, to=sid)

        return

    # ======================================
    # PRIVATO VERSO UN GIOCATORE
    # target = player:<id>
    # ======================================
    if target.startswith("player:"):
        try:
            target_char_id = int(target.split(":", 1)[1])
        except (TypeError, ValueError, IndexError):
            emit(
                "chat_error",
                {"message": "Destinatario non valido."},
                to=request.sid
            )
            return

        target_char = db.session.get(Character, target_char_id)
        if not target_char or target_char.role != "player":
            emit(
                "chat_error",
                {"message": "Destinatario non valido."},
                to=request.sid
            )
            return

        # Un giocatore non ha bisogno di scrivere in privato a sé stesso.
        if role == "player" and int(sender_char_id) == int(target_char_id):
            emit(
                "chat_error",
                {"message": "Seleziona un altro destinatario."},
                to=request.sid
            )
            return

        target_name = html.escape(target_char.name)

        payload = {
            "name": sender_name,
            "message": safe_message,
            "is_master": is_master_message,
            "is_system": False,
            "channel": "private",
            "is_private": True,
            "target_label": target_name,
            "private_route": (
                f"👑 Master → {target_name}"
                if role == "master"
                else f"{html.escape(sender_plain_name)} → {target_name}"
            )
        }

        recipient_sids = set()

        # Destinatario.
        for sid, char_id in list(client_character_ids.items()):
            if char_id is not None and int(char_id) == int(target_char_id):
                recipient_sids.add(sid)

        if role == "master":
            # Chat Master ↔ giocatore: la vedono il Master e il giocatore.
            recipient_sids.update(master_sids)
            recipient_sids.add(request.sid)
        else:
            # Chat giocatore ↔ giocatore: davvero privata.
            # Il Master NON riceve il messaggio.
            for sid, char_id in list(client_character_ids.items()):
                if char_id is not None and int(char_id) == int(sender_char_id):
                    recipient_sids.add(sid)
            recipient_sids.add(request.sid)

        for sid in recipient_sids:
            socketio.emit("chat_message", payload, to=sid)

        return

    emit(
        "chat_error",
        {"message": "Destinatario chat non riconosciuto."},
        to=request.sid
    )

@socketio.on("master_forge_request")
def handle_master_forge_request():
    if request.sid not in master_sids:
        return
    emit("master_forge_library", get_master_forge_library(), to=request.sid)

@socketio.on("master_forge_save")
def handle_master_forge_save(data):
    if request.sid not in master_sids:
        return

    data = data or {}
    definition = build_forged_weapon(data.get("weapon"))
    if not definition:
        emit(
            "master_forge_error",
            {"message": "Arma non valida: controlla almeno nome, danno e velocità d'attacco."},
            to=request.sid
        )
        return

    definition["source"] = "Fucina del Master"

    template = None
    raw_id = data.get("template_id")
    if raw_id not in (None, ""):
        try:
            template = db.session.get(MasterForgeWeapon, int(raw_id))
        except (TypeError, ValueError):
            template = None

        if not template:
            emit("master_forge_error", {"message": "Modello della Fucina non trovato."}, to=request.sid)
            return

        old_definition = template.definition if isinstance(template.definition, dict) else {}
        if old_definition.get("id"):
            definition["id"] = old_definition["id"]
        template.name = definition.get("name") or "Arma forgiata"
        template.definition = definition
        flag_modified(template, "definition")
    else:
        template = MasterForgeWeapon(
            name=definition.get("name") or "Arma forgiata",
            definition=definition
        )
        db.session.add(template)

    db.session.commit()
    emit_master_forge_library()

@socketio.on("master_forge_delete")
def handle_master_forge_delete(data):
    if request.sid not in master_sids:
        return

    try:
        template_id = int((data or {}).get("template_id"))
    except (TypeError, ValueError):
        template_id = None

    template = db.session.get(MasterForgeWeapon, template_id) if template_id else None
    if not template:
        emit("master_forge_error", {"message": "Modello della Fucina non trovato."}, to=request.sid)
        return

    db.session.delete(template)
    db.session.commit()
    emit_master_forge_library()

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

# ==========================================
# TERRENO E SUPERFICI
# Il Master dipinge gli esagoni. Il terreno (altura, coperture) è
# indicativo e lo applica il Master; muri e fumo bloccano la vista,
# i muri anche il movimento; terreno difficile e ghiaccio costano doppio.
# ==========================================
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

# Effetti delle superfici in attesa della decisione del Master
pending_surface_prompts = {}

def hex_key(col, row):
    return f"{col},{row}"

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

# ==========================================
# RIPOSO
# Breve: stamina, concentrazione e PA. Lungo (accampamento): anche
# fine degli effetti a tempo e cura = tasso di cura × ore di riposo,
# decisi dal Master per ogni giocatore. Solo per i personaggi giocanti.
# ==========================================
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

# Riposo lungo in preparazione: {char_id: indice della fiala nello zaino, oppure None = rifiutata}
long_rest_choices = {}

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

def emit_to_character(char_id, event_name, payload):
    for sid, sid_char_id in list(client_character_ids.items()):
        if sid_char_id == char_id:
            socketio.emit(event_name, payload, to=sid)

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

def format_number(value):
    return f"{value:g}"
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

# ==========================================
# SCENE
# Ogni scena conserva mappa, disegni e nebbia. Cambiando scena quella
# aperta viene salvata in automatico, come delle schede.
# Le pedine restano dove sono: il gruppo viaggia con il Master.
# ==========================================
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

# ==========================================
# WIKI DEL MONDO
# Scrive solo il Master; i giocatori leggono le pagine non segrete.
# ==========================================
WIKI_MAX_CONTENT = 100_000
WIKI_MAX_IMAGE = 5_000_000

def emit_wiki_list_to_sid(sid, role):
    char_id = client_character_ids.get(sid)
    pages = WikiPage.query.order_by(WikiPage.category, WikiPage.title).all()
    visible = [page.payload_for(role, char_id) for page in pages if page.is_visible_to(role, char_id)]
    socketio.emit("wiki_list", visible, to=sid)

def broadcast_wiki_page(page):
    """Il Master riceve sempre la pagina; i giocatori solo se possono vederla."""
    for sid, role in list(client_roles.items()):
        char_id = client_character_ids.get(sid)
        if page.is_visible_to(role, char_id):
            socketio.emit("wiki_page_saved", page.payload_for(role, char_id), to=sid)
        else:
            # Pagina appena nascosta: i giocatori la tolgono dal loro wiki
            socketio.emit("wiki_page_removed", {"id": page.id}, to=sid)

def clean_wiki_image(value):
    image = str(value or "").strip()

    if not image or len(image) > WIKI_MAX_IMAGE:
        return None

    if image.startswith("data:image/") or image.startswith(("http://", "https://", "/static/")):
        return image

    return None

@socketio.on("wiki_save_page")
def handle_wiki_save_page(data):
    if request.sid not in master_sids:
        return

    data = data or {}
    title = str(data.get("title", "")).strip()[:160]

    if not title:
        return

    page = db.session.get(WikiPage, data.get("id")) if data.get("id") else None

    if page is None:
        page = WikiPage()
        db.session.add(page)

    page.title = title
    page.category = str(data.get("category", "")).strip()[:60] or "Generale"
    page.content = str(data.get("content", ""))[:WIKI_MAX_CONTENT]
    page.image = clean_wiki_image(data.get("image"))
    page.hidden = bool(data.get("hidden", False))

    db.session.commit()
    broadcast_wiki_page(page)

@socketio.on("wiki_share_page")
def handle_wiki_share_page(data):
    """Consegna una pagina (handout) a personaggi scelti, anche se è segreta."""
    if not is_master_request():
        return

    data = data or {}
    page = db.session.get(WikiPage, data.get("id"))
    if not page:
        return

    char_ids = []
    for raw_id in data.get("char_ids", []):
        char = db.session.get(Character, raw_id)
        if char and char.role == "player":
            char_ids.append(char.id)

    if not char_ids:
        return

    page.shared_with = sorted(set(page.shared_with or []) | set(char_ids))
    db.session.commit()
    broadcast_wiki_page(page)

    # Apre la pagina come popup per i destinatari connessi
    for sid, char_id in list(client_character_ids.items()):
        if char_id in char_ids:
            socketio.emit("wiki_handout", {"id": page.id}, to=sid)

@socketio.on("wiki_delete_page")
def handle_wiki_delete_page(data):
    if request.sid not in master_sids:
        return

    page = db.session.get(WikiPage, (data or {}).get("id"))

    if not page:
        return

    page_id = page.id
    db.session.delete(page)
    db.session.commit()

    socketio.emit("wiki_page_removed", {"id": page_id})

# ==========================================
# PING
# ==========================================
@socketio.on("ping_location")
def handle_ping_location(data):
    # Ritrasmette il segnale a tutti i client (incluso chi lo ha generato)
    emit("show_ping", data, broadcast=True)

# ==========================================
# PUNTATORE LASER / DISEGNO TEMPORANEO
# ==========================================
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

# ==========================================
# MESSAGGI DI COMBATTIMENTO PERSONALIZZATI
# ==========================================
@socketio.on("combat_msg")
def handle_combat_msg(data):
    if not is_master_request():
        return

    # Questo invia un messaggio di sistema senza attivare il controllo dadi!
    emit("dice_result", {"name": data["name"], "message": data["message"], "is_master_roll": False}, broadcast=True)

@socketio.on("sync_pa")
@undoable("Correzione frame movimento")
def handle_sync_pa(data):
    if not is_master_request():
        return

    # Salva il valore in memoria per resistere ai ricaricamenti di pagina
    combat_state["players_pa"][str(data["char_id"])] = data["pa"]
    emit("sync_pa", data, broadcast=True)

THREAT_ACTION = "Minacciare un'area"

def threat_reach(char):
    """Portata per Minacciare: la gittata più lunga tra le armi equipaggiate (almeno 1)."""
    best = 1.0
    stats = char.stats or {}
    equipped = list((stats.get("equipped") or {}).values()) + list((stats.get("equipped_gadgets") or {}).values())

    for item in equipped:
        if not isinstance(item, dict):
            continue
        comp = item.get("custom_definition") if isinstance(item.get("custom_definition"), dict) else get_compendium_item(
            compendium_id=item.get("compendium_id"), name=item.get("name")
        )
        attack_range = compendium_attack_range(comp)
        if attack_range is not None:
            best = max(best, attack_range)

    return best

@socketio.on("request_threat_reach")
def handle_request_threat_reach(data):
    char = db.session.get(Character, (data or {}).get("char_id"))
    if not controls_character(char):
        return
    emit("threat_reach", {"char_id": char.id, "reach": threat_reach(char), "x": char.pos_x, "y": char.pos_y})

def start_threat_interrupts(intruder, threats):
    for threat in threats:
        threatener = db.session.get(Character, threat["char_id"])
        if not threatener:
            continue

        combat_state["interrupts"].append({
            "threat_id": threat["id"],
            "threatener_id": threatener.id,
            "threatener_name": threatener.name,
            "intruder_id": intruder.id,
            "intruder_name": intruder.name
        })

        # Una minaccia segreta di un NPC si rivela solo quando scatta
        socketio.emit("dice_result", {
            "name": "SISTEMA",
            "message": (
                f"⚡ <b>{html.escape(intruder.name)}</b> entra nell'area minacciata da "
                f"<b>{html.escape(threatener.name)}</b>, che agisce per primo!"
            ),
            "is_master_roll": False
        })

    socketio.emit("combat_update", combat_state)

@socketio.on("declare_threat")
@undoable("Minaccia")
def handle_declare_threat(data):
    data = data or {}
    char = db.session.get(Character, data.get("char_id"))

    if not combat_state.get("is_active") or not controls_character(char) or not is_players_turn(char):
        return

    # Esagoni scelti uno a uno, solo entro la portata dell'arma
    reach = threat_reach(char)
    hexes = []
    for raw in data.get("hexes") or []:
        match = re.match(r"^(-?\d+),(-?\d+)$", str(raw))
        if not match:
            continue
        col, row = int(match.group(1)), int(match.group(2))
        key = f"{col},{row}"
        if key not in hexes and hex_distance(char.pos_x, char.pos_y, col, row) <= reach:
            hexes.append(key)

    if not hexes:
        emit_combat_error(f"Scegli almeno un esagono entro la portata della tua arma ({format_number(reach)} m).")
        return

    rule = get_action_speed_rule(THREAT_ACTION)
    if not rule:
        emit_combat_error("Azione di minaccia non presente nella tabella.")
        return

    cost = int(rule.get("frames", 0))
    limb_error = spend_limb_frames(char.id, data.get("limb_shares") or {}, cost)
    if limb_error:
        emit_combat_error(limb_error)
        return

    combat_threats.append({
        "id": str(uuid.uuid4()),
        "char_id": char.id,
        "char_name": char.name,
        "owner_role": char.role,
        "hexes": hexes
    })
    emit_threats()

    # Le minacce degli NPC non si annunciano ai giocatori
    message = {
        "name": char.name,
        "message": f"minaccia {len(hexes)} esagoni spendendo <b>{cost} Frame</b>.",
        "is_master_roll": False
    }
    if char.role == "npc":
        emit_to_masters("dice_result", message)
    else:
        emit("dice_result", message, broadcast=True)

@socketio.on("cancel_threat")
@undoable("Minaccia ritirata")
def handle_cancel_threat(data):
    """Chi minaccia (o il Master) ritira la zona quando vuole, anche fuori turno."""
    global combat_threats

    threat = next((t for t in combat_threats if t["id"] == (data or {}).get("threat_id")), None)
    if not threat:
        return

    owner = db.session.get(Character, threat["char_id"])
    if not controls_character(owner):
        return

    combat_threats = [t for t in combat_threats if t["id"] != threat["id"]]
    emit_threats()

    message = {"name": owner.name, "message": "ritira la minaccia.", "is_master_roll": False}
    if owner.role == "npc":
        emit_to_masters("dice_result", message)
    else:
        socketio.emit("dice_result", message)

@socketio.on("end_interrupt")
@undoable("Fine interruzione")
def handle_end_interrupt():
    if not combat_state.get("interrupts"):
        return

    interrupt = combat_state["interrupts"][0]
    if not controls_character(db.session.get(Character, interrupt["threatener_id"])):
        return

    combat_state["interrupts"].pop(0)
    socketio.emit("dice_result", {
        "name": "SISTEMA",
        "message": f"⚡ Fine interruzione di <b>{html.escape(interrupt['threatener_name'])}</b>.",
        "is_master_roll": False
    })
    socketio.emit("combat_update", combat_state)

@socketio.on("undo_last_action")
def handle_undo_last_action():
    global combat_threats

    if not is_master_request():
        return
    if not undo_stack:
        emit_combat_error("Non c'è niente da annullare.")
        return

    snapshot = undo_stack.pop()
    current_attacks = set(pending_attacks)
    current_results = set(pending_combat_results)
    current_prompts = set(pending_surface_prompts)

    # Stato in memoria: si svuotano e riempiono gli stessi dizionari
    for live, saved in (
        (combat_state, snapshot["combat_state"]),
        (pending_attacks, snapshot["pending_attacks"]),
        (pending_combat_results, snapshot["pending_results"]),
        (pending_surface_prompts, snapshot["surface_prompts"]),
        (pending_explosions, snapshot["explosions"]),
        (pending_exchanges, snapshot["exchanges"]),
    ):
        live.clear()
        live.update(copy.deepcopy(saved))
    combat_threats = copy.deepcopy(snapshot["threats"])
    combat_aims[:] = copy.deepcopy(snapshot["aims"])

    ws = WorldState.query.first()
    if (ws.trinkets or []) != snapshot["trinkets"]:
        ws.trinkets = copy.deepcopy(snapshot["trinkets"])
        flag_modified(ws, "trinkets")

    changed_chars = []
    for char_id, fields in snapshot["characters"].items():
        char = db.session.get(Character, char_id)
        if not char:
            continue
        if any(getattr(char, field) != value for field, value in fields.items()):
            for field, value in fields.items():
                setattr(char, field, copy.deepcopy(value))
                if field in ("pa_stats", "bonuses", "stats", "weapons", "backpack"):
                    flag_modified(char, field)
            changed_chars.append(char)
    db.session.commit()

    for char in changed_chars:
        emit_character_update(char)

    socketio.emit("combat_update", combat_state)
    emit_threats()
    emit_aims()
    emit_trinkets()
    emit_explosions()
    emit_exchanges()

    # Popup legati all'azione annullata: chiusi o riaperti
    for attack_id in current_attacks - set(pending_attacks):
        socketio.emit("incoming_attack_cancelled", {"attack_id": attack_id})
    for sid, role in list(client_roles.items()):
        emit_pending_attacks_to_sid(sid, role, client_character_ids.get(sid))

    for result_id in current_results - set(pending_combat_results):
        emit_to_masters("master_combat_result_cancelled", {"result_id": result_id})
    for result_id in set(pending_combat_results) - current_results:
        emit_to_masters("master_pending_combat_result", pending_combat_results[result_id])

    for prompt_id in current_prompts - set(pending_surface_prompts):
        emit_to_masters("surface_prompt_closed", {"id": prompt_id})
    for prompt_id in set(pending_surface_prompts) - current_prompts:
        emit_to_masters("surface_prompt", pending_surface_prompts[prompt_id])

    socketio.emit("dice_result", {
        "name": "SISTEMA",
        "message": f"↩️ Il Master ha annullato: <b>{html.escape(snapshot['label'])}</b>",
        "is_master_roll": True
    })
    emit_undo_status()

# ==========================================
# TRINKET UMBRYLL
# I gadget "Trinket ..." trasformano le clip "Trinket marca Umbryll" dello
# zaino: si piazzano (trappola, la vedono solo chi l'ha messa e il Master)
# o si lanciano (visibili a tutti). Le bombe si fanno esplodere a distanza:
# chi è nell'area ha una risposta, poi il Master rivede i danni.
# ==========================================
TRINKET_CLIP_ID = "UMB-018"
TRINKET_THROW_RANGE = 10          # esagoni, con linea di vista
TRINKET_PLANT_SPEED = 30          # "applicare un trinket ha velocità 30"
BOMB_DETONATION_SPEED = 30        # "l'attivazione è velocità 30"
BOMB_PAV_PER_BOMB = 5             # "5 pav per ogni bomba attivata"
BOMB_DAMAGE_BY_DISTANCE = {0: 20, 1: 20, 2: 10}   # adiacenti 20, poi 10 fino a 2 esagoni
BOMB_BLAST_RADIUS = max(BOMB_DAMAGE_BY_DISTANCE)
ESCAPE_MAX_STEPS = BOMB_BLAST_RADIUS + 1          # chi schiva si butta fuori dall'area

# Gadget che usano i trinket e che cosa diventano sulla mappa
TRINKET_DEVICE_KINDS = {
    "UMB-006": "bomba",
    "UMB-003": "filo",
    "UMB-009": "spia",
    "UMB-017": "campo",
}

pending_explosions = {}

def frames_for_speed(speed):
    return max(0, 110 - int(speed))

def trinkets_visible_to(role, char_id):
    trinkets = WorldState.query.first().trinkets or []
    return [t for t in trinkets if role == "master" or not t.get("hidden") or t.get("owner_id") == char_id]

def emit_trinkets():
    for sid, role in list(client_roles.items()):
        socketio.emit("trinkets_update", trinkets_visible_to(role, client_character_ids.get(sid)), to=sid)

def owned_trinket_device(char, device_id):
    """Il gadget-trinket deve essere nello zaino o equipaggiato."""
    if device_id not in TRINKET_DEVICE_KINDS:
        return None
    backpack, equipped = char_owned_items(char)
    if any(entry.get("compendium_id") == device_id for entry in backpack + equipped):
        return get_compendium_item(compendium_id=device_id)
    return None

def trinket_clip_index(char):
    for index, entry in enumerate(char.backpack or []):
        if not isinstance(entry, dict) or int(entry.get("qty", 1) or 0) <= 0:
            continue
        if entry.get("compendium_id") == TRINKET_CLIP_ID or "trinket marca umbryll" in str(entry.get("name", "")).lower():
            return index
    return None

def in_combat_turn_order(char):
    return combat_state.get("is_active") and any(int(e.get("id", -1)) == char.id for e in combat_state.get("turn_order", []))

def spend_arms(char_id, cost):
    """Azioni con le mani senza un'arma precisa: prima il braccio destro, il resto il sinistro."""
    limbs = get_limb_frames(char_id)
    if limbs["bd"] + limbs["bs"] < cost:
        return f"Servono {cost} frame nelle braccia, ne hai {limbs['bd'] + limbs['bs']}."
    first = min(cost, limbs["bd"])
    return spend_limb_frames(char_id, {"bd": first, "bs": cost - first}, cost)

@socketio.on("place_trinket")
@undoable("Trinket piazzato")
def handle_place_trinket(data):
    data = data or {}
    char = db.session.get(Character, data.get("char_id"))
    if not controls_character(char):
        return

    device_id = data.get("device_id")
    device = owned_trinket_device(char, device_id)
    if not device:
        emit_combat_error("Ti serve il gadget del trinket (nello zaino o equipaggiato).")
        return

    clip = trinket_clip_index(char)
    if clip is None:
        emit_combat_error("Non hai Trinket marca Umbryll nello zaino.")
        return

    try:
        x, y = int(data.get("x")), int(data.get("y"))
    except (TypeError, ValueError):
        return

    thrown = data.get("mode") == "lancia"
    distance = hex_distance(char.pos_x, char.pos_y, x, y)
    ws = WorldState.query.first()
    if thrown:
        if distance > TRINKET_THROW_RANGE or not has_line_of_sight(char.pos_x, char.pos_y, x, y, sight_blocking_hexes(ws)):
            emit_combat_error(f"Si lancia entro {TRINKET_THROW_RANGE} m e con la linea di vista libera.")
            return
    elif distance > 1:
        emit_combat_error("Un trinket si piazza sul tuo esagono o su uno adiacente.")
        return

    # Il gadget ne contiene un numero massimo
    capacity = int(((device.get("resource") or {}).get("capacity") or 0) or 0)
    placed = [t for t in (ws.trinkets or []) if t.get("owner_id") == char.id and t.get("device_id") == device_id]
    if capacity and len(placed) >= capacity:
        emit_combat_error(f"{device['name']} ne regge al massimo {capacity}.")
        return

    cost_text = ""
    if in_combat_turn_order(char):
        if not is_players_turn(char):
            emit_combat_error("Puoi farlo solo nel tuo turno.")
            return
        rule = get_action_speed_rule("Lanciare un piccolo oggetto") if thrown else None
        cost = int(rule["frames"]) if rule else frames_for_speed(TRINKET_PLANT_SPEED)
        limb_error = spend_arms(char.id, cost)
        if limb_error:
            emit_combat_error(limb_error)
            return
        cost_text = f" (<b>{cost} Frame</b>)"

    # Si consuma una clip
    backpack = copy.deepcopy(char.backpack or [])
    backpack[clip]["qty"] = int(backpack[clip].get("qty", 1) or 1) - 1
    if backpack[clip]["qty"] <= 0:
        backpack.pop(clip)
    char.backpack = backpack
    flag_modified(char, "backpack")

    kind = TRINKET_DEVICE_KINDS[device_id]
    trinket = {
        "id": str(uuid.uuid4()),
        "owner_id": char.id,
        "owner_name": char.name,
        "device_id": device_id,
        "device_name": device["name"],
        "kind": kind,
        "x": x,
        "y": y,
        "hidden": not thrown
    }
    ws.trinkets = list(ws.trinkets or []) + [trinket]
    flag_modified(ws, "trinkets")
    db.session.commit()

    emit_character_update(char)
    emit_trinkets()

    message = {
        "name": char.name,
        "message": (f"🎯 lancia" if thrown else "📍 piazza") + f" un trinket <b>{html.escape(kind)}</b>{cost_text}.",
        "is_master_roll": False
    }
    if thrown:
        socketio.emit("dice_result", message)
    else:
        # Una trappola resta segreta: la sanno solo chi l'ha messa e il Master
        emit_to_masters("dice_result", message)
        emit_to_character(char.id, "dice_result", message)

@socketio.on("detonate_trinkets")
@undoable("Detonazione")
def handle_detonate_trinkets(data):
    data = data or {}
    char = db.session.get(Character, data.get("char_id"))
    if not controls_character(char):
        return

    ws = WorldState.query.first()
    wanted = set(data.get("trinket_ids") or [])
    bombs = [t for t in (ws.trinkets or []) if t["id"] in wanted and t["owner_id"] == char.id and t["kind"] == "bomba"]
    if not bombs:
        emit_combat_error("Scegli almeno una delle tue bombe.")
        return

    # Costo: 5 PAV per bomba e, in combattimento, la velocità dell'attivazione
    pav = BOMB_PAV_PER_BOMB * len(bombs)
    if stat_pa_current(char, "Volontà") < pav:
        emit_combat_error(f"Servono {pav} PA di Volontà per far esplodere {len(bombs)} bomba/e.")
        return

    cost_text = ""
    if in_combat_turn_order(char):
        if not is_players_turn(char):
            emit_combat_error("Puoi farlo solo nel tuo turno.")
            return
        cost = frames_for_speed(BOMB_DETONATION_SPEED)
        limb_error = spend_arms(char.id, cost)
        if limb_error:
            emit_combat_error(limb_error)
            return
        cost_text = f", <b>{cost} Frame</b>"

    pa_stats = dict(char.pa_stats or {})
    pa_stats["Volontà"] = stat_pa_current(char, "Volontà") - pav
    char.pa_stats = pa_stats

    # Le bombe esplodono: spariscono dalla mappa
    ids = {b["id"] for b in bombs}
    ws.trinkets = [t for t in (ws.trinkets or []) if t["id"] not in ids]
    flag_modified(ws, "trinkets")
    db.session.commit()
    emit_character_update(char)
    emit_trinkets()

    # Chi è nell'area (danno per distanza, sommato se più bombe lo prendono)
    targets = {}
    for other in Character.query.filter(Character.role != "master").all():
        damage = 0
        for bomb in bombs:
            distance = hex_distance(bomb["x"], bomb["y"], other.pos_x, other.pos_y)
            damage += BOMB_DAMAGE_BY_DISTANCE.get(distance, 0)
        if damage:
            targets[other.id] = {"char_id": other.id, "name": other.name, "damage": damage, "response": None, "dodged": False, "escaped": False}

    socketio.emit("dice_result", {
        "name": char.name,
        "message": (
            f"💥 attiva <b>{len(bombs)}</b> bomba/e (<b>{pav} PA</b> di Volontà{cost_text}): "
            f"bip... bip... chi è vicino ha un istante per reagire!"
        ),
        "is_master_roll": False
    })
    socketio.emit("explosion_marks", {"bombs": [{"x": b["x"], "y": b["y"]} for b in bombs]})

    explosion = {
        "id": str(uuid.uuid4()),
        "owner_id": char.id,
        "owner_name": char.name,
        "bombs": [{"x": b["x"], "y": b["y"]} for b in bombs],
        "targets": targets
    }
    pending_explosions[explosion["id"]] = explosion

    for target_id in targets:
        notify_explosion_target(explosion, db.session.get(Character, target_id))
    emit_explosions()
    if not targets:
        socketio.emit("dice_result", {"name": "SISTEMA", "message": "💥 <b>BOOM!</b> Nessuno era abbastanza vicino.", "is_master_roll": False})
        pending_explosions.pop(explosion["id"], None)
        emit_explosions()

def notify_explosion_target(explosion, target):
    """Il giocatore bersaglio sceglie la risposta; per gli NPC sceglie il Master dal suo pannello."""
    payload = {"explosion_id": explosion["id"], "owner_name": explosion["owner_name"], "target_id": target.id, "target_name": target.name}
    for sid, cid in list(client_character_ids.items()):
        if cid == target.id and client_roles.get(sid) != "master":
            socketio.emit("explosion_alert", payload, to=sid)

def emit_explosions():
    """Al Master: le esplosioni in attesa, con risposte, danni proposti e armature."""
    data = []
    for explosion in pending_explosions.values():
        rows = []
        for target in explosion["targets"].values():
            char = db.session.get(Character, target["char_id"])
            pieces = armor_pieces(char) if char else []
            torso = next((p["slot"] for p in pieces if p["slot"] in ("petto", "schiena")), None)
            sturdiest = max(pieces, key=lambda p: p["hp"])["slot"] if pieces else None
            rows.append({**target, "role": char.role if char else "", "armor_pieces": pieces, "armor_slot": torso or sturdiest})
        data.append({"id": explosion["id"], "owner_name": explosion["owner_name"], "rows": rows})
    emit_to_masters("explosions_update", data)

@socketio.on("explosion_response")
@undoable("Risposta all'esplosione")
def handle_explosion_response(data):
    data = data or {}
    explosion = pending_explosions.get(data.get("explosion_id"))
    if not explosion:
        return
    target = next((t for t in explosion["targets"].values() if str(t["char_id"]) == str(data.get("target_id"))), None)
    char = db.session.get(Character, target["char_id"]) if target else None
    if not char or not controls_character(char) or target["response"] is not None:
        return

    action = data.get("action")
    cost_text = ""
    if action:
        rule = get_action_speed_rule(action)
        if not rule or rule.get("special"):
            emit_combat_error("Azione non valida come risposta.")
            return
        cost = int(rule.get("frames", 0))
        if in_combat_turn_order(char):
            limb_error = spend_limb_frames(char.id, data.get("limb_shares") or {}, cost)
            if limb_error:
                emit_combat_error(limb_error)
                return
            cost_text = f" (<b>{cost} Frame</b>)"
        action = rule["action"]

    target["response"] = action or "Nessuna reazione"
    socketio.emit("dice_result", {
        "name": char.name,
        "message": "reagisce all'esplosione: " + (f"<b>{html.escape(action)}</b>{cost_text}." if action else "nessuna reazione."),
        "is_master_roll": False
    })
    emit_explosions()

def escape_hexes(explosion, char):
    """Esagoni liberi fuori dall'area di tutte le bombe, raggiungibili senza passare dai muri."""
    ws = WorldState.query.first()
    walls = wall_hexes(ws)
    taken = {(c.pos_x, c.pos_y) for c in Character.query.filter(Character.id != char.id).all()}
    result = []
    for dx in range(-ESCAPE_MAX_STEPS, ESCAPE_MAX_STEPS + 1):
        for dy in range(-ESCAPE_MAX_STEPS - 1, ESCAPE_MAX_STEPS + 2):
            x, y = char.pos_x + dx, char.pos_y + dy
            if x < 0 or y < 0 or (x, y) in taken or hex_distance(char.pos_x, char.pos_y, x, y) > ESCAPE_MAX_STEPS:
                continue
            if any(hex_distance(b["x"], b["y"], x, y) <= BOMB_BLAST_RADIUS for b in explosion["bombs"]):
                continue
            if any(hex_key(hx, hy) in walls for hx, hy in hex_line(char.pos_x, char.pos_y, x, y)[1:]):
                continue
            result.append([x, y])
    return result

def send_escape_prompt(explosion, char):
    """Il giocatore sceglie dove buttarsi; per NPC (o giocatore assente) sceglie il Master."""
    payload = {
        "explosion_id": explosion["id"], "target_id": char.id, "target_name": char.name,
        "hexes": escape_hexes(explosion, char)
    }
    sids = [sid for sid, cid in client_character_ids.items() if cid == char.id and client_roles.get(sid) != "master"]
    if char.role == "npc" or not sids:
        emit_to_masters("explosion_escape", payload)
    for sid in sids:
        socketio.emit("explosion_escape", payload, to=sid)

@socketio.on("explosion_dodge")
@undoable("Schivata dell'esplosione")
def handle_explosion_dodge(data):
    """Il Master decide se la schivata riesce: chi schiva esce dall'area e non prende danni."""
    if not is_master_request():
        return
    data = data or {}
    explosion = pending_explosions.get(data.get("explosion_id"))
    if not explosion:
        return
    target = next((t for t in explosion["targets"].values() if str(t["char_id"]) == str(data.get("target_id"))), None)
    char = db.session.get(Character, target["char_id"]) if target else None
    if not char:
        return

    target["dodged"] = bool(data.get("success"))
    if target["dodged"]:
        socketio.emit("dice_result", {
            "name": char.name,
            "message": "💨 <b>schiva</b> l'esplosione: si butta fuori dalla portata!",
            "is_master_roll": False
        })
        if not target.get("escaped"):
            send_escape_prompt(explosion, char)
    emit_explosions()

@socketio.on("explosion_escape_move")
@undoable("Fuga dall'esplosione")
def handle_explosion_escape_move(data):
    data = data or {}
    explosion = pending_explosions.get(data.get("explosion_id"))
    if not explosion:
        return
    target = next((t for t in explosion["targets"].values() if str(t["char_id"]) == str(data.get("target_id"))), None)
    char = db.session.get(Character, target["char_id"]) if target else None
    if not char or not controls_character(char) or not target["dodged"] or target.get("escaped"):
        return
    try:
        spot = [int(data.get("x")), int(data.get("y"))]
    except (TypeError, ValueError):
        return
    if spot not in escape_hexes(explosion, char):
        emit_combat_error(f"Scegli un esagono libero fuori dall'esplosione, entro {ESCAPE_MAX_STEPS} m.")
        return

    char.pos_x, char.pos_y = spot
    target["escaped"] = True
    db.session.commit()
    emit_character_update(char)
    emit_explosions()

@socketio.on("apply_explosion")
@undoable("Esplosione")
def handle_apply_explosion(data):
    if not is_master_request():
        return
    data = data or {}
    explosion = pending_explosions.pop(data.get("explosion_id"), None)
    if not explosion:
        return

    lines = []
    for row in data.get("rows") or []:
        char = db.session.get(Character, row.get("char_id"))
        if not char or str(char.id) not in {str(k) for k in explosion["targets"]}:
            continue
        try:
            damage = max(0, int(row.get("damage", 0)))
            armor_damage = max(0, int(row.get("armor_damage", 0) or 0))
        except (TypeError, ValueError):
            continue

        target = next(t for t in explosion["targets"].values() if str(t["char_id"]) == str(char.id))
        if target.get("dodged"):
            # Schivata riuscita: fuori dalla portata, nessun danno
            lines.append(f"<b>{html.escape(char.name)}</b> 💨 schivata: nessun danno")
            continue

        char.hp_current = max(0, char.hp_current - damage)
        text_line = f"<b>{html.escape(char.name)}</b> -{damage} HP"

        piece = next((p for p in armor_pieces(char) if p["slot"] == row.get("armor_slot")), None)
        if piece and armor_damage and piece["hp"] > 0:
            taken = min(armor_damage, piece["hp"])
            set_equipment_current_hp(char, piece["slot"], piece["hp"] - taken)
            float_text(char, f"🛡️ -{taken}", "info")
            text_line += f" · 🛡️ {html.escape(str(piece['name']))} -{taken}"
        lines.append(text_line)

    db.session.commit()
    for target_id in explosion["targets"]:
        char = db.session.get(Character, target_id)
        if char:
            emit_character_update(char)

    emit_explosions()
    socketio.emit("dice_result", {
        "name": "SISTEMA",
        "message": "💥 <b>BOOM!</b> La bomba di " + html.escape(explosion["owner_name"]) + " esplode.<br>" + ("<br>".join(lines) or "Nessun danno."),
        "is_master_roll": False
    })

# ==========================================
# RIPARAZIONE RAPIDA ARMATURA
# I danni dell'armatura si ridistribuiscono: ogni pezzo indossato finisce
# alla stessa percentuale della sua durabilità massima. Il totale non cambia.
# In combattimento è un'azione (frame della tabella), fuori è gratis.
# ==========================================
ARMOR_REPAIR_ACTION = "Riparazione rapida armatura"

def even_armor_durability(pieces):
    """Nuova durabilità per pezzo: stessa percentuale, punti avanzati ai resti più grandi."""
    total = sum(p["hp"] for p in pieces)
    total_max = sum(p["max_hp"] for p in pieces)
    if not total_max:
        return {}

    exact = {p["slot"]: p["max_hp"] * total / total_max for p in pieces}
    result = {slot: int(value) for slot, value in exact.items()}
    leftover = total - sum(result.values())
    for slot in sorted(exact, key=lambda s: exact[s] - result[s], reverse=True)[:leftover]:
        result[slot] += 1
    return result

@socketio.on("quick_armor_repair")
@undoable("Riparazione rapida armatura")
def handle_quick_armor_repair(data):
    data = data or {}
    char = db.session.get(Character, data.get("char_id"))
    if not controls_character(char):
        return

    pieces = armor_pieces(char)
    target = even_armor_durability(pieces)
    if len(pieces) < 2 or all(target.get(p["slot"]) == p["hp"] for p in pieces):
        emit_combat_error("Non c'è niente da ridistribuire tra i pezzi dell'armatura.")
        return

    # In combattimento è un'azione del proprio turno, che costa frame
    cost_text = ""
    in_combat = combat_state.get("is_active") and any(int(e.get("id", -1)) == char.id for e in combat_state.get("turn_order", []))
    if in_combat:
        if not is_players_turn(char):
            emit_combat_error("La riparazione rapida si fa nel proprio turno.")
            return
        if not data.get("limb_shares"):
            emit_combat_error("In combattimento usa 'Altra azione' → Riparazione rapida armatura (costa frame).")
            return
        rule = get_action_speed_rule(ARMOR_REPAIR_ACTION)
        cost = int((rule or {}).get("frames", 0))
        limb_error = spend_limb_frames(char.id, data["limb_shares"], cost)
        if limb_error:
            emit_combat_error(limb_error)
            return
        cost_text = f" (<b>{cost} Frame</b>)"

    for piece in pieces:
        set_equipment_current_hp(char, piece["slot"], target[piece["slot"]])
    flag_modified(char, "stats")
    db.session.commit()
    emit_character_update(char)

    summary = " · ".join(f"{html.escape(str(p['name']))} {target[p['slot']]}/{p['max_hp']}" for p in pieces)
    socketio.emit("dice_result", {
        "name": char.name,
        "message": f"🔧 ridistribuisce i danni dell'armatura{cost_text}: {summary}",
        "is_master_roll": False
    })

@socketio.on("perform_table_action")
@undoable("Azione")
def handle_perform_table_action(data):
    data = data or {}
    char = db.session.get(Character, data.get("char_id"))

    if not combat_state.get("is_active") or not controls_character(char) or not is_players_turn(char):
        return

    rule = get_action_speed_rule(data.get("action"))
    if not rule or rule.get("action") in (THREAT_ACTION, ARMOR_REPAIR_ACTION):
        emit_combat_error("Azione non presente nella tabella.")
        return

    try:
        cost = int(rule.get("frames"))
    except (TypeError, ValueError):
        return

    shares = data.get("limb_shares") or {}
    limb_error = spend_limb_frames(char.id, shares, cost)
    if limb_error:
        emit_combat_error(limb_error)
        return

    limb_names = {"bd": "Braccio Dx", "bs": "Braccio Sx", "gd": "Gamba Dx", "gs": "Gamba Sx"}
    split = ", ".join(
        f"{limb_names[limb]} {int(shares[limb])}"
        for limb in LIMB_KEYS
        if int(shares.get(limb) or 0)
    )

    emit("dice_result", {
        "name": char.name,
        "message": (
            f"esegue <b>{html.escape(str(rule.get('action')))}</b> "
            f"({html.escape(str(rule.get('category', '')))}, Vel {rule.get('speed')}, "
            f"<b>{cost} Frame</b>: {split})."
        ),
        "is_master_roll": False
    }, broadcast=True)

@socketio.on("toggle_invisible")
def handle_toggle_invisible(data):
    if not is_master_request():
        return

    char = db.session.get(Character, data.get("char_id"))
    if char and char.role != "master":
        char.is_invisible = bool(data.get("is_invisible", False))
        db.session.commit()
        emit("character_invisible_update", {"id": char.id, "is_invisible": char.is_invisible}, broadcast=True)

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

# ==========================================
# GESTIONE FOG OF WAR (SALVATAGGIO DB)
# ==========================================
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

# Gestione attacco limbs
@socketio.on("set_frames")
@undoable("Modifica dei frame")
def handle_set_frames(data):
    """Il Master imposta in qualsiasi momento i frame di movimento e degli arti di un combattente."""
    if not is_master_request() or not combat_state.get("is_active"):
        return

    data = data or {}
    char = db.session.get(Character, data.get("char_id"))
    if not char:
        return

    try:
        movement = max(0, int(data.get("pa")))
        limbs = {limb: max(0, int((data.get("limbs") or {}).get(limb))) for limb in LIMB_KEYS}
    except (TypeError, ValueError):
        emit_combat_error("Frame non validi: servono numeri interi.")
        return

    combat_state["players_pa"][str(char.id)] = movement
    combat_state["players_limbs"][str(char.id)] = limbs

    socketio.emit("sync_pa", {"char_id": char.id, "pa": movement})
    socketio.emit("sync_limbs", {"char_id": char.id, "limbs": limbs})

    message = {
        "name": "👑 MASTER",
        "message": (
            f"imposta i frame di <b>{html.escape(char.name)}</b>: 🦶 {movement} · "
            f"BD {limbs['bd']} · BS {limbs['bs']} · GD {limbs['gd']} · GS {limbs['gs']}"
        ),
        "is_master_roll": False
    }
    # Gli NPC nascosti restano segreti
    if char.role == "npc" and (char.is_hidden or char.is_invisible):
        emit_to_masters("dice_result", message)
    else:
        socketio.emit("dice_result", message)

@socketio.on("sync_limbs")
@undoable("Correzione frame arti")
def handle_sync_limbs(data):
    if not is_master_request():
        return

    combat_state["players_limbs"][str(data["char_id"])] = data["limbs"]
    emit("sync_limbs", data, broadcast=True)

# Arto con cui si attacca, deciso dallo slot dell'arma (uguale a getSlotCombatLimb in ui.js).
# Cintura, petto, schiena ecc. non sono legati a un arto: lì sceglie il giocatore.
SLOT_COMBAT_LIMBS = {
    "mano_dx": "bd", "guanto_dx": "bd", "avambr_dx": "bd", "spalla_dx": "bd",
    "mano_sx": "bs", "guanto_sx": "bs", "avambr_sx": "bs", "spalla_sx": "bs",
    "stivale_dx": "gd", "stivale_sx": "gs"
}
UNARMED_LIMBS = {"pugno dx": "bd", "pugno sx": "bs"}

# Al difensore mandiamo solo i dati necessari alla reazione, non il danno già calcolato.
INCOMING_ATTACK_FIELDS = (
    "attack_id", "attacker_id", "attacker_name", "defender_id", "defender_name",
    "weapon", "speed", "compendium_id", "source_slot", "damage_formula", "damage_type",
    "range", "distance", "activation_mode", "area_shape", "aim", "no_exchange"
)

# Aree a cui si può mirare e pezzi di armatura che le coprono (in ordine di priorità)
AIM_AREAS = {
    "testa": ("Testa", ["elmo", "visore"]),
    "busto": ("Busto", ["petto", "schiena", "cintura"]),
    "braccio_dx": ("Braccio Dx", ["spalla_dx", "avambr_dx", "guanto_dx"]),
    "braccio_sx": ("Braccio Sx", ["spalla_sx", "avambr_sx", "guanto_sx"]),
    "gamba_dx": ("Gamba Dx", ["gambe", "stivale_dx"]),
    "gamba_sx": ("Gamba Sx", ["gambe", "stivale_sx"]),
}

def armor_pieces(character):
    """Pezzi di armatura indossati con la loro durabilità (uno per oggetto, anche se occupa più slot)."""
    pieces, seen = [], set()
    for slot, item in ((character.stats or {}).get("equipped") or {}).items():
        if not isinstance(item, dict):
            continue
        group = item.get("equip_group_id") or slot
        current, maximum = get_equipment_hp(item)
        if group in seen or maximum <= 0:
            continue
        seen.add(group)
        pieces.append({"slot": slot, "name": item.get("name", slot), "hp": current, "max_hp": maximum})
    return pieces

def detect_attack_situations(attacker, defender, aim):
    """Situazioni dello scontro che possono dare un bonus/malus all'attacco.

    Ognuna porta il valore salvato dal Master (None = mai decisa).
    """
    ws = WorldState.query.first()
    terrain = ws.terrain or {}
    situations = []

    if aim in AIM_AREAS:
        situations.append((f"mira_{aim}", f"Mira: {AIM_AREAS[aim][0]}"))

    # Copertura: sull'esagono del difensore o su quello subito prima lungo la linea di tiro
    # (mai l'esagono dell'attaccante, che c'è quando sono adiacenti)
    line = hex_line(attacker.pos_x, attacker.pos_y, defender.pos_x, defender.pos_y)
    cover_hexes = line[1:][-2:]
    covers = {terrain.get(hex_key(col, row)) for col, row in cover_hexes}
    if "copertura_totale" in covers:
        situations.append(("copertura_totale", "Bersaglio in copertura totale"))
    elif "copertura_parziale" in covers:
        situations.append(("copertura_parziale", "Bersaglio in copertura parziale"))

    attacker_high = terrain.get(hex_key(attacker.pos_x, attacker.pos_y)) == "altura"
    defender_high = terrain.get(hex_key(defender.pos_x, defender.pos_y)) == "altura"
    if attacker_high and not defender_high:
        situations.append(("altura_attaccante", "Attaccante in altura"))
    if defender_high and not attacker_high:
        situations.append(("altura_difensore", "Difensore in altura"))

    if not has_line_of_sight(attacker.pos_x, attacker.pos_y, defender.pos_x, defender.pos_y, sight_blocking_hexes(ws)):
        situations.append(("senza_vista", "Nessuna linea di vista"))

    return [
        {"key": key, "label": label, "value": saved.value if saved else None}
        for key, label in situations
        for saved in [db.session.get(CombatModifier, key)]
    ]

def saved_custom_modifiers():
    """Situazioni aggiunte a mano dal Master: si possono ripescare nella revisione."""
    return [
        {"key": m.key, "label": m.label, "value": m.value}
        for m in CombatModifier.query.filter(CombatModifier.key.like("custom_%")).order_by(CombatModifier.label).all()
    ]

def save_combat_modifiers(raw_modifiers):
    """Salva i modificatori applicati dal Master per riproporli le volte successive."""
    for raw in raw_modifiers if isinstance(raw_modifiers, list) else []:
        if not isinstance(raw, dict) or not raw.get("applied"):
            continue
        key = re.sub(r"[^a-z0-9_]", "", str(raw.get("key", "")).lower())[:80]
        label = str(raw.get("label", "")).strip()[:120]
        try:
            value = int(raw.get("value"))
        except (TypeError, ValueError):
            continue
        if not key or not label:
            continue
        modifier = db.session.get(CombatModifier, key) or CombatModifier(key=key)
        modifier.label = label
        modifier.value = value
        db.session.merge(modifier)

def default_armor_slot(character, aim, reaction, def_limb):
    """Pezzo proposto al Master: quello che copre l'area mirata, oppure quello che ha parato."""
    worn = {piece["slot"] for piece in armor_pieces(character)}
    equipped = (character.stats or {}).get("equipped") or {}

    if aim in AIM_AREAS:
        for slot in AIM_AREAS[aim][1]:
            item = equipped.get(slot)
            if isinstance(item, dict):
                # Un oggetto su più slot è registrato con il suo primo slot
                group = item.get("equip_group_id")
                match = next((p["slot"] for p in armor_pieces(character)
                              if p["slot"] == slot or (group and equipped.get(p["slot"], {}).get("equip_group_id") == group)), None)
                if match:
                    return match

    if reaction == "Parata":
        slot, _ = get_defense_equipment(character, def_limb)
        if slot in worn:
            return slot

    return None

def incoming_attack_payload(attack):
    return {field: attack.get(field) for field in INCOMING_ATTACK_FIELDS}

def emit_pending_attacks_to_sid(sid, role, char_id):
    """Chi si collega (o sceglie il personaggio) dopo l'attacco può comunque reagire."""
    for attack in list(pending_attacks.values()):
        defender = db.session.get(Character, attack["defender_id"])
        if not defender:
            continue
        is_defender = role == "player" and char_id == defender.id
        is_npc_for_master = role == "master" and defender.role == "npc"
        if is_defender or is_npc_for_master:
            socketio.emit("incoming_attack", incoming_attack_payload(attack), to=sid)

@socketio.on("declare_attack")
@undoable("Attacco")
def handle_declare_attack(data):
    data = data or {}

    attacker = db.session.get(Character, data.get("attacker_id"))
    defender = db.session.get(Character, data.get("defender_id"))

    if not attacker or not defender or attacker.id == defender.id:
        return

    if not controls_character(attacker) or not is_players_turn(attacker):
        return

    target_error = interrupt_target_error(attacker, defender)
    if target_error:
        emit_combat_error(target_error)
        return

    # Un giocatore non può colpire ciò che non vede (nascosto o invisibile)
    if not is_master_request() and defender.role == "npc" and (defender.is_hidden or defender.is_invisible):
        return

    aim = data.get("aim") if data.get("aim") in AIM_AREAS else None

    attack_limb = str(data.get("limb", "bd"))
    if attack_limb not in LIMB_KEYS:
        attack_limb = "bd"

    requested_name = str(data.get("weapon", "Mani Nude")).strip() or "Mani Nude"
    source_slot = data.get("source_slot") or None
    compendium_id = data.get("compendium_id") or None

    is_unarmed = requested_name.casefold() in {"pugno dx", "pugno sx", "mani nude"}

    equipped_slot, equipped_item = get_equipped_attack_item(
        attacker,
        source_slot=source_slot,
        compendium_id=compendium_id,
        weapon_name=requested_name
    )

    # Un'arma su una mano, un guanto, un avambraccio... si usa con quell'arto
    weapon_limb = UNARMED_LIMBS.get(requested_name.casefold()) or SLOT_COMBAT_LIMBS.get(equipped_slot or source_slot)
    if weapon_limb:
        attack_limb = weapon_limb

    # Se il client dichiara uno slot/id del compendio, l'oggetto deve essere davvero equipaggiato.
    if not is_unarmed and (source_slot or compendium_id) and not equipped_item:
        emit(
            "dice_result",
            {
                "name": "SISTEMA",
                "message": "⚠️ Attacco rifiutato: l'oggetto selezionato non risulta equipaggiato.",
                "is_master_roll": False
            },
            to=request.sid
        )
        return

    if not compendium_id and equipped_item:
        compendium_id = equipped_item.get("compendium_id")

    custom_definition = (equipped_item or {}).get("custom_definition")
    if isinstance(custom_definition, dict):
        comp_item = custom_definition
    else:
        comp_item = get_compendium_item(
            compendium_id=compendium_id,
            name=(equipped_item or {}).get("name") if equipped_item else requested_name
        )

    weapon_name = (
        comp_item.get("name")
        if comp_item
        else (equipped_item or {}).get("name", requested_name)
    )

    required_license = missing_weapon_license(
        attacker,
        comp_item
    )

    if required_license:
        emit(
            "dice_result",
            {
                "name": "SISTEMA",
                "message": (
                    "🔒 Attacco rifiutato: manca la licenza "
                    f"<b>{html.escape(str(required_license))}</b>."
                ),
                "is_master_roll": False
            },
            to=request.sid
        )
        return

    server_speed = compendium_attack_speed(comp_item)

    if server_speed is None:
        try:
            server_speed = int(data.get("speed"))
        except (TypeError, ValueError):
            server_speed = None

    if server_speed is None or server_speed <= 0:
        emit(
            "dice_result",
            {
                "name": "SISTEMA",
                "message": "⚠️ Attacco rifiutato: velocità non valida.",
                "is_master_roll": False
            },
            to=request.sid
        )
        return

    distance = hex_distance(
        attacker.pos_x,
        attacker.pos_y,
        defender.pos_x,
        defender.pos_y
    )

    attack_range = compendium_attack_range(comp_item)
    if is_unarmed and attack_range is None:
        attack_range = 1.0

    if attack_range is not None and distance > attack_range:
        emit(
            "dice_result",
            {
                "name": "SISTEMA",
                "message": (
                    f"⚠️ Bersaglio fuori range: {distance} m, "
                    f"massimo {attack_range:g} m."
                ),
                "is_master_roll": False
            },
            to=request.sid
        )
        return

    # Armi a distanza: prima si mira (o il bersaglio è nella zona minacciata)
    ranged_shot_label = None
    if is_ranged_weapon(comp_item) and combat_state.get("is_active"):
        check_aims()
        aim_on_target = next(
            (a for a in combat_aims if a["shooter_id"] == attacker.id and a["target_id"] == defender.id),
            None
        )
        if target_in_shooter_threat(attacker, defender):
            ranged_shot_label = "Nella zona minacciata"
        elif aim_on_target and aim_on_target["ready"]:
            ranged_shot_label = f"Mirato ({aim_on_target['reaction']})"
        elif aim_on_target:
            emit_combat_error(f"Aspetta che {defender.name} reagisca alla mira.")
            return
        else:
            emit_combat_error(f"Prima devi prendere la mira su {defender.name}.")
            return

    # Arma da fuoco: serve almeno un colpo nel caricatore
    loaded_ammo = None
    if firearm_spec(comp_item) and equipped_item and equipped_slot:
        if "ammo_loaded" not in equipped_item:
            auto_load_new_firearms(attacker)
            equipped_item = ((attacker.stats or {}).get("equipped") or {}).get(equipped_slot) or equipped_item
        loaded_ammo = equipped_item.get("ammo_loaded") or {}
        if int(loaded_ammo.get("count", 0) or 0) < 1:
            db.session.commit()
            emit_combat_error(f"{weapon_name} è scarica: ricarica prima di sparare.")
            return

    damage_data = (comp_item or {}).get("combat", {}).get("damage", {})
    activation = (comp_item or {}).get("activation", {})
    area = (comp_item or {}).get("combat", {}).get("area", {})

    damage_resolution = resolve_attack_damage(
        comp_item,
        attacker,
        distance,
        weapon_name=weapon_name
    )

    # Il costo dell'attacco si paga con l'arto scelto, solo dopo tutti i controlli
    limb_error = spend_limb_frames(attacker.id, {attack_limb: max(0, 110 - server_speed)}, max(0, 110 - server_speed))
    if limb_error:
        emit_combat_error(limb_error)
        return

    if loaded_ammo is not None:
        set_loaded_ammo(attacker, equipped_slot, {**loaded_ammo, "count": int(loaded_ammo["count"]) - 1})
        db.session.commit()
        emit_character_update(attacker)

    attack_id = str(uuid.uuid4())

    attack = {
        "attack_id": attack_id,
        "attacker_id": attacker.id,
        "attacker_name": attacker.name,
        "defender_id": defender.id,
        "defender_name": defender.name,
        "weapon": weapon_name,
        "speed": server_speed,
        "compendium_id": compendium_id,
        "source_slot": equipped_slot or source_slot,
        "damage_formula": damage_data.get("formula"),
        "damage_type": damage_data.get("type"),
        "resolved_damage": damage_resolution.get("damage"),
        "resolved_damage_formula": damage_resolution.get("formula"),
        "damage_automatic": damage_resolution.get("automatic", False),
        "damage_note": damage_resolution.get("note"),
        "range": attack_range,
        "distance": distance,
        "activation_mode": activation.get("mode"),
        "area_shape": area.get("shape"),
        "aim": aim
    }

    pending_attacks[attack_id] = attack

    # La dichiarazione dell'attacco è pubblica, ma nessun tiro/danno viene ancora pubblicato.
    emit(
        "dice_result",
        {
            "name": attacker.name,
            "message": (
                f"sferra un attacco con <b>{html.escape(str(weapon_name))}</b> "
                f"contro <b>{html.escape(str(defender.name))}</b> "
                f"a Velocità <b>{server_speed}</b>!"
            ),
            "is_master_roll": False
        },
        broadcast=True
    )

    # Colpo mirato (o nella zona minacciata): il bersaglio ha già reagito alla mira,
    # il colpo va dritto alla revisione del Master
    if ranged_shot_label:
        build_pending_result(attack, attacker, defender, "Nessuna", ranged_shot_label, 0, "bd")
        return

    emit("incoming_attack", incoming_attack_payload(attack), broadcast=True)

def build_pending_result(attack, attacker, defender, reaction, reaction_label, def_speed, def_limb_key):
    """Tira i dadi e manda il risultato in revisione al Master (nessun HP cambia qui)."""
    try:
        att_speed = int(attack["speed"])
    except (TypeError, ValueError):
        att_speed = 0

    # I dadi vengono tirati qui, ma il risultato resta segreto fino alla pubblicazione del Master.
    att_roll = random.randint(1, 20) + (att_speed // 10)
    def_roll = random.randint(1, 20) + (def_speed // 10)

    result_id = str(uuid.uuid4())
    result = {
        "result_id": result_id,
        "attack_id": attack["attack_id"],
        "attacker_id": attacker.id,
        "attacker_name": attacker.name,
        "defender_id": defender.id,
        "defender_name": defender.name,
        "weapon": attack.get("weapon", "Mani Nude"),
        "reaction_type": reaction,
        "reaction_label": reaction_label,
        "def_limb": def_limb_key,
        "att_speed": att_speed,
        "def_speed": def_speed,
        "att_roll": att_roll,
        "def_roll": def_roll,
        "damage": attack.get("resolved_damage"),
        "damage_formula": attack.get("resolved_damage_formula") or attack.get("damage_formula"),
        "damage_note": attack.get("damage_note"),
        "damage_type": attack.get("damage_type"),
        "distance": attack.get("distance"),
        "range": attack.get("range"),
        "compendium_id": attack.get("compendium_id"),
        "source_slot": attack.get("source_slot"),
        "aim": attack.get("aim"),
        "aim_label": AIM_AREAS[attack["aim"]][0] if attack.get("aim") in AIM_AREAS else None,
        "armor_pieces": armor_pieces(defender),
        "modifiers": detect_attack_situations(attacker, defender, attack.get("aim")),
        "custom_modifiers": saved_custom_modifiers(),
        "armor_slot": default_armor_slot(defender, attack.get("aim"), reaction, def_limb_key)
    }

    pending_combat_results[result_id] = result

    # Una reazione può essere inviata una sola volta.
    pending_attacks.pop(attack["attack_id"], None)

    emit_to_masters("master_pending_combat_result", result)

@socketio.on("resolve_reaction")
@undoable("Reazione")
def handle_resolve_reaction(data):
    data = data or {}
    attack_id = data.get("attack_id")
    attack = pending_attacks.get(attack_id)

    if not attack:
        emit(
            "dice_result",
            {
                "name": "SISTEMA",
                "message": "⚠️ Questo attacco non è più disponibile o è già stato risolto.",
                "is_master_roll": False
            },
            to=request.sid
        )
        return

    attacker = db.session.get(Character, attack["attacker_id"])
    defender = db.session.get(Character, attack["defender_id"])

    if not attacker or not defender:
        pending_attacks.pop(attack_id, None)
        return

    # Reagisce solo chi controlla il difensore
    if not controls_character(defender):
        return

    try:
        att_speed = int(attack["speed"])
    except (TypeError, ValueError):
        return

    weapon_name = attack.get("weapon", "Mani Nude")
    reaction = str(data.get("reaction_type", "Schivata"))
    def_limb_key = str(data.get("def_limb", "bd"))

    if reaction not in {"Schivata", "Parata", "Scambio"}:
        reaction = "Schivata"

    # Dopo uno scambio chi perde si difende normalmente: niente secondo scambio
    if reaction == "Scambio" and attack.get("no_exchange"):
        emit_combat_error("Hai perso lo scambio: ora puoi solo parare o schivare.")
        return

    reaction_action_map = {
        "Parata": "Parare",
        "Schivata": "Schivare"
    }

    # Le voci "Difesa" della tabella indicano con quale meccanica si risolvono
    # (es. "Alzare uno scudo" -> Parata). Velocità e meccanica arrivano
    # dal compendio, mai dal client.
    reaction_rule = None
    reaction_action = str(data.get("reaction_action") or "").strip()

    if reaction_action:
        reaction_rule = get_action_speed_rule(reaction_action)

        if reaction_rule and reaction_rule.get("reaction") in {"Schivata", "Parata"}:
            reaction = reaction_rule["reaction"]
        else:
            reaction_rule = None
            reaction_action = ""

    if not reaction_rule and reaction != "Scambio":
        reaction_rule = get_action_speed_rule(
            reaction_action_map.get(reaction)
        )

    if reaction_rule:
        try:
            def_speed = int(
                reaction_rule.get("speed")
            )
        except (TypeError, ValueError):
            return
    else:
        try:
            def_speed = int(
                data.get("def_speed")
            )
        except (TypeError, ValueError):
            return

    if def_speed <= 0:
        return

    # Scambio: il difensore sceglie con che cosa colpirebbe se vince il tiro
    counter = None
    if reaction == "Scambio":
        counter = build_counter_attack(defender, attacker, data.get("exchange_weapon") or {}, def_speed)
        if isinstance(counter, str):
            emit_combat_error(counter)
            return

    if def_limb_key not in LIMB_KEYS:
        def_limb_key = "bd"

    # Costo della reazione: dalla tabella, oppure 110 - velocità (Scambio)
    try:
        reaction_cost = int(reaction_rule.get("frames")) if reaction_rule else max(0, 110 - def_speed)
    except (TypeError, ValueError):
        reaction_cost = max(0, 110 - def_speed)

    limb_shares = data.get("limb_shares") or {def_limb_key: reaction_cost}
    limb_error = spend_limb_frames(defender.id, limb_shares, reaction_cost)
    if limb_error:
        emit_combat_error(limb_error)
        return

    # L'arto principale (quello che para) deve essere tra quelli usati
    if def_limb_key not in limb_shares:
        def_limb_key = max(limb_shares, key=lambda limb: int(limb_shares[limb] or 0))

    if def_limb_key not in LIMB_KEYS:
        def_limb_key = "bd"

    if counter:
        start_exchange(attack, counter, attacker, defender, def_speed)
        return

    build_pending_result(attack, attacker, defender, reaction, reaction_action or reaction, def_speed, def_limb_key)

# ==========================================
# SCAMBIO D'ATTACCO
# Il difensore risponde attaccando: i due tirano d20 + velocità/10 (pareggio
# = si ritira), il Master conferma o decide lui chi vince. Chi vince attacca
# con la sua arma, chi perde si difende normalmente (parata o schivata),
# poi il Master rivede l'attacco come sempre.
# ==========================================
pending_exchanges = {}

def emit_exchanges():
    socketio.emit("exchanges_update", list(pending_exchanges.values()))

def build_counter_attack(char, target, choice, speed):
    """L'attacco che il difensore porterebbe vincendo lo scambio (o un messaggio d'errore)."""
    requested_name = str(choice.get("weapon") or "Mani Nude").strip() or "Mani Nude"
    source_slot = choice.get("source_slot") or None
    compendium_id = choice.get("compendium_id") or None
    is_unarmed = requested_name.casefold() in {"pugno dx", "pugno sx", "mani nude"}

    equipped_slot, equipped_item = get_equipped_attack_item(
        char, source_slot=source_slot, compendium_id=compendium_id, weapon_name=requested_name
    )
    if not is_unarmed and not equipped_item:
        return "Per lo scambio scegli un'arma che hai equipaggiata."

    custom_definition = (equipped_item or {}).get("custom_definition")
    if isinstance(custom_definition, dict):
        comp_item = custom_definition
    else:
        comp_item = get_compendium_item(
            compendium_id=compendium_id or (equipped_item or {}).get("compendium_id"),
            name=(equipped_item or {}).get("name") if equipped_item else requested_name
        )
    weapon_name = comp_item.get("name") if comp_item else (equipped_item or {}).get("name", requested_name)

    required_license = missing_weapon_license(char, comp_item)
    if required_license:
        return f"Per usare {weapon_name} manca la licenza {required_license}."

    distance = hex_distance(char.pos_x, char.pos_y, target.pos_x, target.pos_y)
    attack_range = compendium_attack_range(comp_item)
    if is_unarmed and attack_range is None:
        attack_range = 1.0
    if attack_range is not None and distance > attack_range:
        return f"{weapon_name} non arriva: {distance} m, massimo {attack_range:g} m."

    if firearm_spec(comp_item) and equipped_item and int((equipped_item.get("ammo_loaded") or {}).get("count", 0) or 0) < 1:
        return f"{weapon_name} è scarica."

    damage_data = (comp_item or {}).get("combat", {}).get("damage", {})
    damage_resolution = resolve_attack_damage(comp_item, char, distance, weapon_name=weapon_name)
    return {
        "attack_id": str(uuid.uuid4()),
        "attacker_id": char.id,
        "attacker_name": char.name,
        "defender_id": target.id,
        "defender_name": target.name,
        "weapon": weapon_name,
        "speed": speed,
        "compendium_id": compendium_id or (equipped_item or {}).get("compendium_id"),
        "source_slot": equipped_slot or source_slot,
        "damage_formula": damage_data.get("formula"),
        "damage_type": damage_data.get("type"),
        "resolved_damage": damage_resolution.get("damage"),
        "resolved_damage_formula": damage_resolution.get("formula"),
        "damage_automatic": damage_resolution.get("automatic", False),
        "damage_note": damage_resolution.get("note"),
        "range": attack_range,
        "distance": distance,
        "activation_mode": (comp_item or {}).get("activation", {}).get("mode"),
        "area_shape": (comp_item or {}).get("combat", {}).get("area", {}).get("shape"),
        "aim": None,
        "is_firearm": bool(firearm_spec(comp_item)),
        "no_exchange": True
    }

def start_exchange(attack, counter, attacker, defender, def_speed):
    pending_attacks.pop(attack["attack_id"], None)
    exchange = {
        "id": str(uuid.uuid4()),
        "attack": attack,
        "counter": counter,
        "sides": [
            {"char_id": attacker.id, "name": attacker.name, "weapon": attack.get("weapon"), "speed": int(attack.get("speed") or 0), "roll": None},
            {"char_id": defender.id, "name": defender.name, "weapon": counter["weapon"], "speed": int(def_speed), "roll": None}
        ],
        "proposed_winner": None
    }
    pending_exchanges[exchange["id"]] = exchange
    socketio.emit("dice_result", {
        "name": defender.name,
        "message": (
            f"⚔️ risponde con uno <b>Scambio d'Attacco</b> ({html.escape(str(counter['weapon']))}, Velocità <b>{def_speed}</b>)! "
            f"<b>{html.escape(attacker.name)}</b> e <b>{html.escape(defender.name)}</b> tirano per vedere chi colpisce."
        ),
        "is_master_roll": False
    })
    emit_exchanges()

@socketio.on("exchange_roll")
@undoable("Tiro dello scambio")
def handle_exchange_roll(data):
    data = data or {}
    exchange = pending_exchanges.get(data.get("exchange_id"))
    if not exchange:
        return
    side = next((s for s in exchange["sides"] if str(s["char_id"]) == str(data.get("char_id"))), None)
    char = db.session.get(Character, side["char_id"]) if side else None
    if not char or not controls_character(char) or side["roll"] is not None:
        return

    die = random.randint(1, 20)
    bonus = side["speed"] // 10
    side["roll"] = {"die": die, "bonus": bonus, "total": die + bonus}
    socketio.emit("dice_result", {
        "name": char.name,
        "message": f"🎲 Scambio: d20 <b>{die}</b> + {bonus} (velocità) = <b>{die + bonus}</b>",
        "is_master_roll": False
    })

    a, b = exchange["sides"]
    if a["roll"] and b["roll"]:
        if a["roll"]["total"] == b["roll"]["total"]:
            a["roll"] = b["roll"] = None
            exchange["proposed_winner"] = None
            socketio.emit("dice_result", {"name": "SISTEMA", "message": "⚔️ Scambio in parità: si ritira!", "is_master_roll": False})
        else:
            winner = a if a["roll"]["total"] > b["roll"]["total"] else b
            exchange["proposed_winner"] = winner["char_id"]
    emit_exchanges()

@socketio.on("exchange_decide")
@undoable("Esito dello scambio")
def handle_exchange_decide(data):
    """Il Master conferma (o decide lui) chi vince: il vincitore attacca, l'altro si difende."""
    if not is_master_request():
        return
    data = data or {}
    exchange = pending_exchanges.get(data.get("exchange_id"))
    if not exchange:
        return
    original_attacker_id = exchange["sides"][0]["char_id"]
    winner_id = data.get("winner_id")
    if str(winner_id) not in {str(s["char_id"]) for s in exchange["sides"]}:
        return

    if str(winner_id) == str(original_attacker_id):
        attack = {**exchange["attack"], "no_exchange": True}
    else:
        attack = dict(exchange["counter"])
        winner = db.session.get(Character, attack["attacker_id"])
        # L'arma da fuoco spara davvero: un colpo in meno
        if attack.pop("is_firearm", False) and winner and attack.get("source_slot"):
            item = ((winner.stats or {}).get("equipped") or {}).get(attack["source_slot"]) or {}
            loaded = item.get("ammo_loaded") or {}
            if int(loaded.get("count", 0) or 0) > 0:
                set_loaded_ammo(winner, attack["source_slot"], {**loaded, "count": int(loaded["count"]) - 1})
                db.session.commit()
                emit_character_update(winner)
    attack.pop("is_firearm", None)

    pending_exchanges.pop(exchange["id"], None)
    pending_attacks[attack["attack_id"]] = attack
    emit_exchanges()

    socketio.emit("dice_result", {
        "name": "SISTEMA",
        "message": (
            f"⚔️ <b>{html.escape(attack['attacker_name'])}</b> vince lo scambio e attacca "
            f"<b>{html.escape(attack['defender_name'])}</b> con <b>{html.escape(str(attack['weapon']))}</b>: "
            "ora può solo parare o schivare."
        ),
        "is_master_roll": False
    })
    socketio.emit("incoming_attack", incoming_attack_payload(attack))

# ==========================================
# MIRA (ARMI A DISTANZA)
# Per sparare bisogna prima mirare: il bersaglio viene avvisato e reagisce
# (un'azione della tabella o niente), poi si può sparare. La mira resta
# finché qualcosa non la spezza: chi mira si muove, la linea di vista si
# chiude, l'arma lascia la mano, la si abbassa o finisce il combattimento.
# Chi spara a un bersaglio dentro una sua zona minacciata non deve mirare.
# ==========================================
combat_aims = []

def is_ranged_weapon(comp):
    return bool(firearm_spec(comp)) or "distanza" in str((comp or {}).get("type", "")).lower()

def emit_aims():
    socketio.emit("aims_update", combat_aims)

def aim_action_kind(comp, item_name):
    name = str((comp or {}).get("name") or item_name or "").lower()
    return "pistola" if any(k in name for k in ("pistol", "revolver")) else "fucile"

def spend_two_arms(char_id, slot, cost):
    """Azioni a due mani (mirare, ricaricare): paga prima il braccio dell'arma, il resto l'altro."""
    gun_arm = SLOT_COMBAT_LIMBS.get(slot, "bd")
    other_arm = "bs" if gun_arm == "bd" else "bd"
    first = min(cost, get_limb_frames(char_id)[gun_arm])
    return spend_limb_frames(char_id, {gun_arm: first, other_arm: cost - first}, cost)

def break_aims(should_break, reason):
    """Toglie le mire che non reggono più e lo annuncia in chat."""
    broken = [aim for aim in combat_aims if should_break(aim)]
    if not broken:
        return
    combat_aims[:] = [aim for aim in combat_aims if aim not in broken]
    for aim in broken:
        why = reason(aim) if callable(reason) else reason
        socketio.emit("dice_result", {
            "name": "SISTEMA",
            "message": (
                f"🎯 La mira di <b>{html.escape(aim['shooter_name'])}</b> su "
                f"<b>{html.escape(aim['target_name'])}</b> si interrompe: {html.escape(why)}."
            ),
            "is_master_roll": False
        })
    emit_aims()

def check_aims():
    """Linea di vista ancora libera e arma ancora in mano, per ogni mira."""
    if not combat_aims:
        return
    blocked = sight_blocking_hexes(WorldState.query.first())

    def broken_reason(aim):
        shooter = db.session.get(Character, aim["shooter_id"])
        target = db.session.get(Character, aim["target_id"])
        if not shooter or not target:
            return "personaggio non più in campo"
        weapon = ((shooter.stats or {}).get("equipped") or {}).get(aim["slot"])
        if not isinstance(weapon, dict) or weapon.get("name") != aim["weapon"]:
            return "l'arma non è più in mano"
        if not has_line_of_sight(shooter.pos_x, shooter.pos_y, target.pos_x, target.pos_y, blocked):
            return "linea di vista ostruita"
        return None

    reasons = {aim["id"]: broken_reason(aim) for aim in combat_aims}
    break_aims(lambda aim: reasons.get(aim["id"]), lambda aim: reasons[aim["id"]])

def target_in_shooter_threat(shooter, target):
    key = hex_key(target.pos_x, target.pos_y)
    return any(t["char_id"] == shooter.id and key in t["hexes"] for t in combat_threats)

def notify_aim_target(aim, target):
    """Il bersaglio sceglie come reagire; per gli NPC (o un giocatore assente) decide il Master."""
    sids = [sid for sid, cid in client_character_ids.items() if cid == target.id]
    if target.role == "npc" or not sids:
        emit_to_masters("aim_alert", aim)
    for sid in sids:
        socketio.emit("aim_alert", aim, to=sid)

@socketio.on("declare_aim")
@undoable("Mira")
def handle_declare_aim(data):
    data = data or {}
    shooter = db.session.get(Character, data.get("char_id"))
    target = db.session.get(Character, data.get("target_id"))

    if not combat_state.get("is_active") or not shooter or not target or shooter.id == target.id:
        return
    if not controls_character(shooter) or not is_players_turn(shooter):
        return
    target_error = interrupt_target_error(shooter, target)
    if target_error:
        emit_combat_error(target_error)
        return

    slot = data.get("slot")
    weapon = ((shooter.stats or {}).get("equipped") or {}).get(slot)
    comp = equipped_item_compendium(weapon) if isinstance(weapon, dict) else None
    if not comp or not is_ranged_weapon(comp):
        emit_combat_error("Si mira solo con un'arma a distanza equipaggiata.")
        return

    if not has_line_of_sight(shooter.pos_x, shooter.pos_y, target.pos_x, target.pos_y, sight_blocking_hexes(WorldState.query.first())):
        emit_combat_error(f"Non vedi {target.name}: la linea di vista è ostruita.")
        return

    weapon_range = compendium_attack_range(comp)
    distance = hex_distance(shooter.pos_x, shooter.pos_y, target.pos_x, target.pos_y)
    if weapon_range is not None and distance > weapon_range:
        emit_combat_error(f"{target.name} è fuori portata: {distance} m, massimo {weapon_range:g} m.")
        return

    rule = get_action_speed_rule(f"Mirare con {aim_action_kind(comp, weapon.get('name'))}")
    cost = int((rule or {}).get("frames", 0))
    if cost:
        limb_error = spend_two_arms(shooter.id, slot, cost)
        if limb_error:
            emit_combat_error(limb_error)
            return

    # Una mira alla volta: una nuova sostituisce la precedente
    combat_aims[:] = [aim for aim in combat_aims if aim["shooter_id"] != shooter.id]
    aim = {
        "id": str(uuid.uuid4()),
        "shooter_id": shooter.id,
        "shooter_name": shooter.name,
        "target_id": target.id,
        "target_name": target.name,
        "slot": slot,
        "weapon": weapon.get("name"),
        "ready": False,
        "reaction": None
    }
    combat_aims.append(aim)
    emit_aims()

    socketio.emit("dice_result", {
        "name": shooter.name,
        "message": (
            f"🎯 prende la mira su <b>{html.escape(target.name)}</b> con "
            f"<b>{html.escape(str(weapon.get('name')))}</b>" + (f" (<b>{cost} Frame</b>)." if cost else ".")
        ),
        "is_master_roll": False
    })
    notify_aim_target(aim, target)

@socketio.on("aim_response")
@undoable("Reazione alla mira")
def handle_aim_response(data):
    """Il bersaglio reagisce alla mira (anche fuori turno): un'azione della tabella o niente."""
    data = data or {}
    aim = next((a for a in combat_aims if a["id"] == data.get("aim_id")), None)
    if not aim or aim["ready"]:
        return

    target = db.session.get(Character, aim["target_id"])
    if not controls_character(target):
        return

    action = data.get("action")
    cost_text = ""
    if action:
        rule = get_action_speed_rule(action)
        if not rule or rule.get("special"):
            emit_combat_error("Azione non valida come reazione alla mira.")
            return
        cost = int(rule.get("frames", 0))
        limb_error = spend_limb_frames(target.id, data.get("limb_shares") or {}, cost)
        if limb_error:
            emit_combat_error(limb_error)
            return
        action = rule["action"]
        cost_text = f" (<b>{cost} Frame</b>)"

    aim["ready"] = True
    aim["reaction"] = action or "Nessuna reazione"
    emit_aims()

    socketio.emit("dice_result", {
        "name": target.name,
        "message": (
            f"reagisce alla mira di <b>{html.escape(aim['shooter_name'])}</b>: "
            + (f"<b>{html.escape(action)}</b>{cost_text}." if action else "nessuna reazione.")
        ),
        "is_master_roll": False
    })

@socketio.on("drop_aim")
@undoable("Mira abbassata")
def handle_drop_aim(data):
    aim = next((a for a in combat_aims if a["id"] == (data or {}).get("aim_id")), None)
    if not aim or not controls_character(db.session.get(Character, aim["shooter_id"])):
        return
    break_aims(lambda a: a["id"] == aim["id"], "abbassa la mira")

# Esiti dello scontro scelti dal Master: (nome in chat, il colpo va a segno?)
COMBAT_OUTCOMES = {
    "colpito": ("Colpito", True),
    "bruciapelo": ("Colpito a bruciapelo", True),
    "parzialmente_parato": ("Colpito ma parzialmente parato", True),
    "parato": ("Parato", False),
    "schivato": ("Schivato", False),
    "mancato": ("Mancato", False),
}

def combat_outcome_sentence(outcome, reaction, defender_name, damage):
    """Frase della chat per l'esito, es. "🩸 Schivata fallita! DiDDi subisce 6 danni"."""
    name = f"<b>{html.escape(defender_name)}</b>"
    takes = f"{name} subisce <b>{damage} {'danno' if damage == 1 else 'danni'}</b>"

    if outcome == "schivato":
        return f"💨 {name} schiva l'attacco!"
    if outcome == "parato":
        return f"🛡️ {name} para l'attacco!"
    if outcome == "mancato":
        return f"💨 L'attacco manca {name}!"
    if outcome == "bruciapelo":
        return f"💥 Colpito a bruciapelo! {takes}"
    if outcome == "parzialmente_parato":
        return f"🛡️ Parata parziale! {takes}"

    # Colpito: la frase dipende dalla reazione tentata
    if reaction == "Nessuna":
        return f"🎯 Colpo a segno! {takes}"
    if reaction == "Schivata":
        return f"🩸 Schivata fallita! {takes}"
    if reaction == "Parata":
        return f"🩸 L'attacco trapassa la guardia! {takes}"
    return f"⚔️ Nessuna difesa! {takes}"

def default_combat_outcome(reaction, att_roll, def_roll):
    """Esito proposto dai tiri; il Master può sempre cambiarlo."""
    try:
        defended = int(def_roll) >= int(att_roll)
    except (TypeError, ValueError):
        defended = False

    if reaction == "Schivata":
        return "schivato" if defended else "colpito"
    if reaction == "Parata":
        return "parato" if defended else "parzialmente_parato"
    if reaction == "Nessuna":
        return "mancato" if defended else "colpito"
    return "colpito"

@socketio.on("master_publish_combat_result")
@undoable("Risultato dello scontro")
def handle_master_publish_combat_result(data):
    data = data or {}

    if request.sid not in master_sids:

        print(
            "[COMBAT] PUBBLICAZIONE RIFIUTATA: "
            "socket non registrato come Master",
            request.sid
        )

        emit(
            "master_combat_error",
            {
                "message":
                    "Il server non riconosce questa sessione come Master."
            },
            to=request.sid
        )

        return

    result_id = data.get("result_id")
    result = pending_combat_results.get(result_id)

    if not result:
        return

    attacker = db.session.get(Character, result["attacker_id"])
    defender = db.session.get(Character, result["defender_id"])

    if not attacker or not defender:
        pending_combat_results.pop(result_id, None)
        return

    # Il danno scritto dal Master è quello finale: sono gli HP che il difensore perde
    try:
        damage = max(0, int(data.get("damage", 0)))
        armor_damage = max(0, int(data.get("armor_damage", 0) or 0))
    except (TypeError, ValueError):
        return

    reaction = result.get("reaction_type", "Schivata")
    outcome = data.get("outcome")
    if outcome not in COMBAT_OUTCOMES:
        outcome = default_combat_outcome(reaction, result.get("att_roll"), result.get("def_roll"))

    label, is_hit = COMBAT_OUTCOMES[outcome]
    if not is_hit:
        damage = 0

    defender.hp_current = max(0, defender.hp_current - damage)

    # Bonus/malus applicati: restano in memoria per la prossima volta
    save_combat_modifiers(data.get("modifiers"))

    # Danno all'armatura, separato dagli HP: va al pezzo scelto dal Master
    armor_hit = None
    armor_slot = data.get("armor_slot")
    piece = next((p for p in armor_pieces(defender) if p["slot"] == armor_slot), None)
    if piece and armor_damage and piece["hp"] > 0:
        taken = min(armor_damage, piece["hp"])
        set_equipment_current_hp(defender, armor_slot, piece["hp"] - taken)
        float_text(defender, f"🛡️ -{taken}", "info")
        armor_hit = {"name": piece["name"], "damage": taken, "hp": piece["hp"] - taken, "max_hp": piece["max_hp"]}

    db.session.commit()
    emit_character_update(defender)

    # Banner del risultato sullo schermo di tutti (solo al Master se il difensore è nascosto)
    banner = {
        "attacker": attacker.name,
        "defender": defender.name,
        "outcome": label,
        "hit": is_hit,
        "damage": damage,
        "aim": AIM_AREAS[result["aim"]][0] if result.get("aim") in AIM_AREAS else None,
        "armor": armor_hit
    }
    if defender.role == "npc" and (defender.is_hidden or defender.is_invisible):
        emit_to_masters("combat_banner", banner)
    else:
        socketio.emit("combat_banner", banner)

    if not is_hit:
        float_text(defender, f"{label}!", "info")

    # In chat: esito e danni, niente tiri di dado
    public_message = (
        "⚔️ <b>RISOLUZIONE SCONTRO</b> ⚔️<br>"
        + combat_outcome_sentence(outcome, reaction, defender.name, damage)
    )
    if armor_hit:
        public_message += (
            f"<br>🛡️ <b>{html.escape(str(armor_hit['name']))}</b>: -{armor_hit['damage']} "
            f"({armor_hit['hp']}/{armor_hit['max_hp']})"
        )

    note = str(data.get("message", "")).strip()
    if note:
        # La nota del Master è testo semplice; i newline diventano <br>
        public_message += "<br><i>" + html.escape(note).replace("\n", "<br>") + "</i>"

    emit(
        "dice_result",
        {
            "name": "SISTEMA",
            "message": public_message,
            "is_master_roll": False
        },
        broadcast=True
    )

    pending_combat_results.pop(result_id, None)

@socketio.on("master_discard_combat_result")
@undoable("Scarto del risultato")
def handle_master_discard_combat_result(data):
    data = data or {}

    if request.sid not in master_sids:
        return

    result_id = data.get("result_id")
    pending_combat_results.pop(result_id, None)

def get_npc_token_library():
    tokens = NpcTokenPreset.query.order_by(NpcTokenPreset.name).all()

    return [
        {
            "id": token.id,
            "name": token.name,
            "image_data": token.image_data
        }
        for token in tokens
    ]

@socketio.on("get_npc_tokens")
def handle_get_npc_tokens():
    emit("npc_token_library", get_npc_token_library())

@socketio.on("save_npc_token")
def handle_save_npc_token(data):
    if not is_master_request():
        return

    name = str(data.get("name", "")).strip()
    image_data = data.get("image_data", "")

    if not name or not image_data:
        return

    token = NpcTokenPreset(
        name=name,
        image_data=image_data
    )

    db.session.add(token)
    db.session.commit()

    emit(
        "npc_token_library",
        get_npc_token_library(),
        broadcast=True
    )

# ==========================================
# HTTPS (opzionale)
# Il microfono (registrare i suoni degli NPC) il browser lo concede solo su
# localhost o su https. Chi si collega dalla porta inoltrata usa http, quindi
# con --https il server usa un certificato fatto in casa: la prima volta ogni
# browser mostra un avviso ("non sicuro") da accettare, poi funziona tutto.
# Certificato e chiave stanno in instance/certs (fuori da git).
# ==========================================
CERT_DIR = os.path.join(app.instance_path, "certs")

def ensure_https_cert(extra_hosts=()):
    """Crea (una volta sola) il certificato autofirmato; lo rifà se cambiano gli indirizzi."""
    import ipaddress
    import subprocess

    cert_path = os.path.join(CERT_DIR, "cert.pem")
    key_path = os.path.join(CERT_DIR, "key.pem")
    hosts_path = os.path.join(CERT_DIR, "hosts.txt")

    hosts = ["localhost", "127.0.0.1", *[h.strip() for h in extra_hosts if h and h.strip()]]
    hosts = list(dict.fromkeys(hosts))
    wanted = "\n".join(hosts)

    current = open(hosts_path).read() if os.path.exists(hosts_path) else None
    if os.path.exists(cert_path) and os.path.exists(key_path) and current == wanted:
        return cert_path, key_path

    def san(host):
        try:
            ipaddress.ip_address(host)
            return f"IP:{host}"
        except ValueError:
            return f"DNS:{host}"

    os.makedirs(CERT_DIR, exist_ok=True)
    subprocess.run([
        "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256",
        "-days", "825", "-subj", "/CN=Venander",
        "-keyout", key_path, "-out", cert_path,
        "-addext", "subjectAltName=" + ",".join(san(h) for h in hosts),
    ], check=True, capture_output=True)
    os.chmod(key_path, 0o600)
    with open(hosts_path, "w") as handle:
        handle.write(wanted)
    print(f"🔐 Nuovo certificato per: {', '.join(hosts)}")
    return cert_path, key_path

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Avvia la partita di Venander.")
    parser.add_argument("--https", action="store_true",
                        help="usa https (serve a chi si collega da fuori per registrare con il microfono)")
    parser.add_argument("--host", action="append", default=[], metavar="INDIRIZZO",
                        help="indirizzo pubblico o nome con cui gli altri si collegano (ripetibile)")
    parser.add_argument("--port", type=int, default=5000)
    args = parser.parse_args()

    ssl_context = ensure_https_cert(args.host) if args.https else None
    if ssl_context:
        print(f"🔐 Partita su https://localhost:{args.port} (la prima volta il browser chiede di accettare il certificato)")

    socketio.run(
        app,
        host="0.0.0.0",
        port=args.port,
        debug=True,
        use_reloader=False,
        # Il debugger interattivo stampa un traceback ogni volta che un
        # browser chiude la connessione (ricarica, scheda chiusa...): rumore.
        # Gli errori veri vengono comunque stampati.
        use_debugger=False,
        ssl_context=ssl_context
    )
