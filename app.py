from flask import Flask, render_template, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text
from flask_socketio import SocketIO, emit
from sqlalchemy.orm.attributes import flag_modified
import os
import random
import re
import json
import math
import uuid
import html

# ==========================================
# CONFIGURAZIONE FLASK
# ==========================================
app = Flask(__name__)
app.config["SECRET_KEY"] = "chiave_segreta_venander"
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///venander.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins="*", max_http_buffer_size=50000000)

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
    type = db.Column(db.String(20), default="line") # 'line', 'circle', 'square', 'triangle', 'icon'
    sx = db.Column(db.Float, nullable=False)
    sy = db.Column(db.Float, nullable=False)
    ex = db.Column(db.Float, default=0.0)
    ey = db.Column(db.Float, default=0.0)
    color = db.Column(db.String(20), default="#000000")
    size = db.Column(db.Integer, default=3) # Usato per lo spessore o per il raggio
    img_data = db.Column(db.Text, nullable=True) # Conterrà l'immagine convertita

class WorldState(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    map_url = db.Column(db.Text, default="")
    map_scale = db.Column(db.Float, default=1.0)
    map_dx = db.Column(db.Integer, default=0)
    map_dy = db.Column(db.Integer, default=0)
    fow_enabled = db.Column(db.Boolean, default=False)
    revealed_hexes = db.Column(db.JSON, default=list)


# ==========================================
# MEMORIA GLOBALE COMBATTIMENTO E SETUP DB
# ==========================================
pending_attacks = {}
pending_combat_results = {}
master_sids = set()

combat_state = {
    "is_active": False,
    "turn_order": [],
    "current_index": 0,
    "epicenter": {"x": 0, "y": 0},
    "players_pa": {},  # Dizionario per memorizzare i PA dei giocatori
    "players_limbs":{}
}

# Funzione per leggere sempre i dati aggiornati dal database
def get_world_state():
    ws = WorldState.query.first()
    return {
        "map_url": ws.map_url,
        "map_scale": ws.map_scale,
        "map_dx": ws.map_dx,
        "map_dy": ws.map_dy,
        "fow_enabled": ws.fow_enabled,
        "revealed_hexes": ws.revealed_hexes
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
        "is_invisible": char.is_invisible,"xp": char.xp, "shop": char.shop, "notes": char.notes
    }

# ==========================================
# WEBSOCKET - CONNESSIONE / RUOLI SESSIONE
# ==========================================
def emit_to_masters(event_name, data):
    """Invia un evento solo ai socket registrati come Master."""
    for sid in list(master_sids):
        socketio.emit(event_name, data, to=sid)


@socketio.on("register_session_role")
def handle_register_session_role(data):
    role = str((data or {}).get("role", "")).strip().lower()

    master_sids.discard(request.sid)

    if role == "master":
        master_sids.add(request.sid)

        # Se il Master ricarica la pagina mentre ci sono risultati
        # in attesa, glieli rimandiamo.
        for result in pending_combat_results.values():
            emit("master_pending_combat_result", result, to=request.sid)


@socketio.on("disconnect")
def handle_disconnect():
    master_sids.discard(request.sid)


@socketio.on("connect")
def handle_connect():
    chars = Character.query.order_by(Character.id).all()
    char_list = [get_char_data(char) for char in chars]
    emit("init_state", char_list)
    
    draw_items = DrawItem.query.all()
    draw_list = [{"uid": d.uid, "type": d.type, "sx": d.sx, "sy": d.sy, "ex": d.ex, "ey": d.ey, "c": d.color, "w": d.size, "img": d.img_data} for d in draw_items]

    emit("combat_update", combat_state)
    emit("init_drawings", draw_list) # Invia i nuovi disegni
    emit("compendio_data", load_compendio())
    emit("map_update", get_world_state())
# ==========================================
# GESTIONE COMBATTIMENTO
# ==========================================
@socketio.on("toggle_combat")
def handle_toggle_combat():
    global combat_state
    combat_state["is_active"] = not combat_state["is_active"]

    # Un nuovo stato di combattimento invalida richieste e risultati precedenti.
    pending_attacks.clear()
    pending_combat_results.clear()
    
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
        
        emit("dice_result", {"name": "SISTEMA", "message": "⚔️ <b>COMBATTIMENTO INIZIATO!</b> L'ordine di turno è calcolato in base alla vicinanza all'epicentro.", "is_master_roll": True}, broadcast=True)
    else:
        combat_state["turn_order"] = []
        emit("dice_result", {"name": "SISTEMA", "message": "🕊️ <b>Combattimento terminato.</b>", "is_master_roll": True}, broadcast=True)

    emit("combat_update", combat_state, broadcast=True)

@socketio.on("next_turn")
def handle_next_turn():
    global combat_state
    if not combat_state["is_active"] or not combat_state["turn_order"]: 
        return
        
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
            emit("update_character", get_char_data(char), broadcast=True)
            
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

    emit("combat_update", combat_state, broadcast=True)
# ==========================================
# GESTIONE PEDINE E MAPPA
# ==========================================
@socketio.on("register_player")
def handle_register_player(data):
    char_id = data.get("char_id")
    name = data.get("name", "").strip()
    if not char_id or not name: return
    char = db.session.get(Character, char_id)
    if not char or char.role != "player": return
    
    existing = Character.query.filter(Character.name == name, Character.id != char_id).first()
    if existing: return
    
    char.name = name
    db.session.commit()
    emit("update_character", get_char_data(char), broadcast=True)

@socketio.on("declare_move")
def handle_move(data):
    char_id = data.get("char_id")
    char = db.session.get(Character, char_id)
    if not char or char.role == "master": return

    target_x = data.get("target_x")
    target_y = data.get("target_y")
    if target_x is None or target_y is None: return

    char.pos_x = target_x
    char.pos_y = target_y
    db.session.commit()
    emit("update_character", get_char_data(char), broadcast=True)

@socketio.on("spawn_npc")
def handle_spawn_npc(data):
    new_npc = Character(
        name=data.get("name", "Mostro"), 
        role="npc", 
        pos_x=data.get("x", 0),
        pos_y=data.get("y", 0),
        color=data.get("color", "#000000"), 
        hp_max=data.get("hp", 30), 
        hp_current=data.get("hp", 30),
        stats={"Tipo": "NPC / Nemico"}, weapons=[], skills=[], backpack=[], xp=0, shop=[],
        is_hidden=data.get("is_hidden", False),
        token_url=data.get("token_url", "")
    )
    db.session.add(new_npc)
    db.session.commit()
    emit("update_character", get_char_data(new_npc), broadcast=True)
    
@socketio.on("update_vitals")
def handle_update_vitals(data):
    char_id = data.get("char_id")
    char = db.session.get(Character, char_id)
    if not char: return

    if "hp" in data: char.hp_current = max(0, min(char.hp_max, char.hp_current + int(data["hp"])))
    if "stamina" in data: char.stamina_current = max(0, min(char.stamina_max, char.stamina_current + int(data["stamina"])))
    if "conc" in data: char.conc_current = max(0, min(char.conc_max, char.conc_current + int(data["conc"])))
    if "status" in data: char.status = str(data["status"])

    db.session.commit()
    emit("update_character", get_char_data(char), broadcast=True)

@socketio.on("spend_pa")
def handle_spend_pa(data):
    char_id = data.get("char_id")
    stat_key = data.get("stat")
    amount = int(data.get("amount", 1))
    
    char = db.session.get(Character, char_id)
    if not char: return

    current_pa_stats = dict(char.pa_stats) if char.pa_stats else {}
    if stat_key not in current_pa_stats:
        stat_val = int(char.stats.get(stat_key, 1))
        current_pa_stats[stat_key] = 6 + (stat_val - 1) * 3
        
    if current_pa_stats[stat_key] > 0 and amount > 0:
        actual_spent = min(amount, current_pa_stats[stat_key])
        current_pa_stats[stat_key] -= actual_spent
        char.pa_stats = current_pa_stats
        
        db.session.commit()
        emit("update_character", get_char_data(char), broadcast=True)
        emit("dice_result", {"name": char.name, "message": f"ha speso {actual_spent} PA di <b>{stat_key}</b>.", "is_master_roll": False}, broadcast=True)

@socketio.on("reset_pa")
def handle_reset_pa(data):
    char_id = data.get("char_id")
    stat_key = data.get("stat")
    cost_type = data.get("cost_type")
    
    char = db.session.get(Character, char_id)
    if not char: return

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
        emit("update_character", get_char_data(char), broadcast=True)
        emit("dice_result", {"name": char.name, "message": f"ha speso 15 {msg_cost} per ripristinare i PA di <b>{stat_key}</b>!", "is_master_roll": False}, broadcast=True)

@socketio.on("update_xp")
def handle_update_xp(data):
    char = db.session.get(Character, data.get("char_id"))
    if not char: return
    try:
        char.xp = max(0, char.xp + int(data.get("amount", 0)))
        db.session.commit()
        emit("update_character", get_char_data(char), broadcast=True)
    except (TypeError, ValueError): return

@socketio.on("delete_character")
def handle_delete_character(data):
    char = db.session.get(Character, data.get("char_id"))
    if char and char.role != "master":
        db.session.delete(char)
        db.session.commit()
        emit("character_deleted", {"id": data.get("char_id")}, broadcast=True)

@socketio.on("toggle_hidden")
def handle_toggle_hidden(data):
    char = db.session.get(Character, data.get("char_id"))
    if char and char.role != "master":
        char.is_hidden = bool(data.get("is_hidden", False))
        db.session.commit()
        emit("character_hidden_update", {"id": char.id, "is_hidden": char.is_hidden}, broadcast=True)

@socketio.on("update_character_sheet")
def handle_update_character_sheet(data):
    char = db.session.get(Character, data.get("char_id"))
    if not char: return
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
    db.session.commit()
    emit("update_character", get_char_data(char), broadcast=True)

@socketio.on("buy_skill")
def handle_buy_skill(data):
    char = db.session.get(Character, data.get("char_id"))
    if not char: return

    cost = int(data.get("cost", 0))
    skill_name = data.get("skill_name")
    
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
    emit("update_character", get_char_data(char), broadcast=True)

def load_compendio():
    path = os.path.join(app.root_path, "compendio.json")
    if not os.path.exists(path): return {}
    try:
        with open(path, "r", encoding="utf-8") as f: return json.load(f)
    except (json.JSONDecodeError, OSError): return {}

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
    equipped = ((character.stats or {}).get("equipped") or {})

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
        item = equipped.get(source_slot)
        if item and matches(item):
            return source_slot, item

    for slot, item in equipped.items():
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
    char = db.session.get(Character, data.get("char_id"))
    skill_data = data.get("skill")
    if not char or not skill_data: return

    current_shop = list(char.shop) if char.shop else []
    if any(item.get("name") == skill_data.get("name") for item in current_shop): return

    current_shop.append(skill_data)
    char.shop = current_shop
    db.session.commit()
    emit("update_character", get_char_data(char), broadcast=True)

@socketio.on("roll_dice")
def handle_roll_dice(data):
    char = db.session.get(Character, data.get("char_id")) if data.get("char_id") else None
    dice_expr = data.get("dice", "1d20").lower().strip()
    is_master = bool(data.get("is_master", False))

    name = char.name if char else "Sconosciuto"
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
        msg = f"ha provato a tirare '<i>{dice_expr}</i>', ma non è un formato valido."

    result_data = {"name": name, "message": msg, "is_master_roll": is_master}
    emit("dice_result", result_data, to=request.sid if is_master else None, broadcast=not is_master)


@socketio.on("clear_drawings")
def handle_clear_drawings():
    db.session.query(DrawItem).delete()
    db.session.query(Line).delete() # Puliamo anche le vecchie linee per sicurezza
    db.session.commit()
    emit("clear_lines", broadcast=True)


@socketio.on("delete_drawing")
def handle_delete_drawing(data):
    uid = data.get("uid")
    if uid:
        DrawItem.query.filter_by(uid=uid).delete()
        db.session.commit()
        emit("drawing_deleted", {"uid": uid}, broadcast=True)


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


@socketio.on("draw_item")
def handle_draw_item(data):
    try:
        new_item = DrawItem(
            uid=data.get("uid", ""),
            type=data.get("type", "line"),
            sx=data["sx"], sy=data["sy"],
            ex=data.get("ex", 0), ey=data.get("ey", 0),
            color=data.get("c", "#000000"),
            size=data.get("w", 3),
            img_data=data.get("img", None)
        )
        db.session.add(new_item)
        db.session.commit()
        emit("draw_item", data, broadcast=True, include_self=False)
    except Exception as e: 
        print("Errore nel salvataggio disegno:", e)

@socketio.on("update_drawing")
def handle_update_drawing(data):
    # Aggiorna le coordinate di un disegno esistente (trascinamento)
    item = DrawItem.query.filter_by(uid=data.get("uid")).first()
    if item:
        item.sx = data.get("sx", item.sx)
        item.sy = data.get("sy", item.sy)
        item.ex = data.get("ex", item.ex)
        item.ey = data.get("ey", item.ey)
        db.session.commit()
        emit("drawing_updated", data, broadcast=True, include_self=False)


# ==========================================
# MESSAGGI DI COMBATTIMENTO PERSONALIZZATI
# ==========================================
@socketio.on("combat_msg")
def handle_combat_msg(data):
    # Questo invia un messaggio di sistema senza attivare il controllo dadi!
    emit("dice_result", {"name": data["name"], "message": data["message"], "is_master_roll": False}, broadcast=True)



@socketio.on("sync_pa")
def handle_sync_pa(data):
    # Salva il valore in memoria per resistere ai ricaricamenti di pagina
    combat_state["players_pa"][str(data["char_id"])] = data["pa"]
    emit("sync_pa", data, broadcast=True, include_self=False)

@socketio.on("toggle_invisible")
def handle_toggle_invisible(data):
    char = db.session.get(Character, data.get("char_id"))
    if char and char.role != "master":
        char.is_invisible = bool(data.get("is_invisible", False))
        db.session.commit()
        emit("character_invisible_update", {"id": char.id, "is_invisible": char.is_invisible}, broadcast=True)


@socketio.on("set_map")
def handle_set_map(data):
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
    ws = WorldState.query.first()
    ws.fow_enabled = data.get("enabled", False)
    db.session.commit()
    emit("map_update", get_world_state(), broadcast=True)

@socketio.on("reset_fow")
def handle_reset_fow():
    ws = WorldState.query.first()
    ws.revealed_hexes = []
    db.session.commit()
    emit("map_update", get_world_state(), broadcast=True)

@socketio.on("reveal_hexes")
def handle_reveal_hexes(data):
    ws = WorldState.query.first()
    new_hexes = data.get("hexes", [])
    current_set = set(ws.revealed_hexes)
    current_set.update(new_hexes)
    ws.revealed_hexes = list(current_set)
    db.session.commit()
    emit("map_update", get_world_state(), broadcast=True)

@socketio.on("sync_fow_hexes")
def handle_sync_fow(hex_list):
    ws = WorldState.query.first()
    ws.revealed_hexes = hex_list
    db.session.commit()
    emit("update_fow_hexes", hex_list, broadcast=True)


# Gestione attacco limbs
@socketio.on("sync_limbs")
def handle_sync_limbs(data):
    combat_state["players_limbs"][str(data["char_id"])] = data["limbs"]
    emit("sync_limbs", data, broadcast=True, include_self=False)


@socketio.on("declare_attack")
def handle_declare_attack(data):
    data = data or {}

    attacker = db.session.get(Character, data.get("attacker_id"))
    defender = db.session.get(Character, data.get("defender_id"))

    if not attacker or not defender or attacker.id == defender.id:
        return

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

    comp_item = get_compendium_item(
        compendium_id=compendium_id,
        name=(equipped_item or {}).get("name") if equipped_item else requested_name
    )

    weapon_name = (
        comp_item.get("name")
        if comp_item
        else (equipped_item or {}).get("name", requested_name)
    )

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

    damage_data = (comp_item or {}).get("combat", {}).get("damage", {})
    activation = (comp_item or {}).get("activation", {})
    area = (comp_item or {}).get("combat", {}).get("area", {})

    damage_resolution = resolve_attack_damage(
        comp_item,
        attacker,
        distance,
        weapon_name=weapon_name
    )

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
        "area_shape": area.get("shape")
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

    # Al difensore mandiamo solo i dati necessari alla reazione, non il danno già calcolato.
    incoming_attack = {
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
        "range": attack_range,
        "distance": distance,
        "activation_mode": activation.get("mode"),
        "area_shape": area.get("shape")
    }

    emit("incoming_attack", incoming_attack, broadcast=True)


@socketio.on("resolve_reaction")
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

    try:
        att_speed = int(attack["speed"])
        def_speed = int(data.get("def_speed", 100))
    except (TypeError, ValueError):
        return

    weapon_name = attack.get("weapon", "Mani Nude")
    reaction = str(data.get("reaction_type", "Schivata"))
    def_limb_key = str(data.get("def_limb", "bd"))

    if reaction not in {"Schivata", "Parata", "Scambio"}:
        reaction = "Schivata"

    if def_limb_key not in {"bd", "bs", "gd", "gs"}:
        def_limb_key = "bd"

    damage = attack.get("resolved_damage")
    damage_formula = attack.get("resolved_damage_formula") or attack.get("damage_formula")
    damage_note = attack.get("damage_note")

    # I dadi vengono tirati qui, ma il risultato resta segreto fino alla pubblicazione del Master.
    att_roll = random.randint(1, 20) + (att_speed // 10)
    def_roll = random.randint(1, 20) + (def_speed // 10)

    result_id = str(uuid.uuid4())

    result = {
        "result_id": result_id,
        "attack_id": attack_id,
        "attacker_id": attacker.id,
        "attacker_name": attacker.name,
        "defender_id": defender.id,
        "defender_name": defender.name,
        "weapon": weapon_name,
        "reaction_type": reaction,
        "def_limb": def_limb_key,
        "att_speed": att_speed,
        "def_speed": def_speed,
        "att_roll": att_roll,
        "def_roll": def_roll,
        "damage": damage,
        "damage_formula": damage_formula,
        "damage_note": damage_note,
        "damage_type": attack.get("damage_type"),
        "distance": attack.get("distance"),
        "range": attack.get("range"),
        "compendium_id": attack.get("compendium_id"),
        "source_slot": attack.get("source_slot")
    }

    pending_combat_results[result_id] = result

    # Una reazione può essere inviata una sola volta.
    pending_attacks.pop(attack_id, None)

    # Nessun HP viene modificato e nessun tiro viene pubblicato qui.
    emit_to_masters("master_pending_combat_result", result)


@socketio.on("master_publish_combat_result")
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

    try:
        att_roll = int(data.get("att_roll"))
        def_roll = int(data.get("def_roll"))
        damage = max(0, int(data.get("damage", 0)))
    except (TypeError, ValueError):
        return

    reaction = result.get("reaction_type", "Schivata")
    def_limb_key = result.get("def_limb", "bd")
    resolution_lines = []

    if reaction == "Schivata":
        if def_roll >= att_roll:
            resolution_lines.append(
                f"💨 <b>{html.escape(defender.name)}</b> schiva perfettamente l'attacco!"
            )
        else:
            defender.hp_current = max(0, defender.hp_current - damage)
            resolution_lines.append(
                f"🩸 Schivata fallita! <b>{html.escape(defender.name)}</b> subisce "
                f"<b>{damage} danni</b> (HP Rimanenti: {defender.hp_current})."
            )

    elif reaction == "Parata":
        if def_roll >= att_roll:
            resolution_lines.append(
                f"🛡️ <b>{html.escape(defender.name)}</b> para perfettamente! "
                "L'attacco è respinto senza danni."
            )
        else:
            defense_slot, defense_item = get_defense_equipment(defender, def_limb_key)
            armor_hp, armor_max_hp = get_equipment_hp(defense_item)

            damage_to_armor = min(damage, armor_hp) if armor_hp > 0 else 0
            damage_to_player = damage - damage_to_armor

            if defense_item and armor_hp > 0:
                new_armor_hp = armor_hp - damage_to_armor
                set_equipment_current_hp(defender, defense_slot, new_armor_hp)
                resolution_lines.append(
                    f"🛡️ <b>{html.escape(str(defense_item.get('name', 'Equipaggiamento')))}</b> "
                    f"assorbe <b>{damage_to_armor}</b> danni "
                    f"({new_armor_hp}/{armor_max_hp} HP)."
                )

            if damage_to_player > 0:
                defender.hp_current = max(0, defender.hp_current - damage_to_player)
                resolution_lines.append(
                    f"🩸 L'attacco trapassa la guardia! <b>{html.escape(defender.name)}</b> "
                    f"subisce <b>{damage_to_player} danni</b> "
                    f"(HP Rimanenti: {defender.hp_current})."
                )
            elif damage == 0:
                resolution_lines.append("🛡️ Nessun danno da applicare.")

    elif reaction == "Scambio":
        defender.hp_current = max(0, defender.hp_current - damage)
        resolution_lines.append(
            f"⚔️ Nessuna difesa! <b>{html.escape(defender.name)}</b> accetta "
            f"<b>{damage} danni</b> per colpire a sua volta "
            f"(HP Rimanenti: {defender.hp_current})."
        )

    db.session.commit()

    emit("update_character", get_char_data(defender), broadcast=True)

    public_message = str(data.get("message", "")).strip()

    if public_message:
        # Il testo del Master viene trattato come testo semplice; i newline diventano <br>.
        public_message = html.escape(public_message).replace("\n", "<br>")
    else:
        public_message = (
            "⚔️ <b>RISOLUZIONE SCONTRO</b> ⚔️"
            f"<br>Attacco ({html.escape(str(result.get('weapon', 'Attacco')))}): <b>{att_roll}</b>"
            f"<br>Difesa ({html.escape(str(reaction))}): <b>{def_roll}</b>"
            f"<br>Danno impostato dal Master: <b>{damage}</b>"
        )

        if resolution_lines:
            public_message += "<br>" + "<br>".join(resolution_lines)

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


if __name__ == "__main__":
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)

