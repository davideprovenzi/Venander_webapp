from flask import Flask, render_template, request
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit
from sqlalchemy.orm.attributes import flag_modified
import os
import random
import re
import json
import math

# ==========================================
# CONFIGURAZIONE FLASK
# ==========================================
app = Flask(__name__)
app.config["SECRET_KEY"] = "chiave_segreta_venander"
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///venander.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins="*")

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




# ==========================================
# MEMORIA GLOBALE COMBATTIMENTO E SETUP DB
# ==========================================
combat_state = {
    "is_active": False,
    "turn_order": [],
    "current_index": 0,
    "epicenter": {"x": 0, "y": 0},
    "players_pa": {},  # Dizionario per memorizzare i PA dei giocatori
    "players_limbs":{}
}

# Mappa di sfondo
world_state = {
    "map_url": "",
    "map_scale": 1.0,
    "map_dx": 0,
    "map_dy": 0,
    "fow_enabled": False,
    "revealed_hexes": []
}

with app.app_context():
    db.create_all()
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
        "photo_url": char.photo_url, "lore": char.lore, "hp_current": char.hp_current, "hp_max": char.hp_max,
        "stamina_current": char.stamina_current, "stamina_max": char.stamina_max,
        "conc_current": char.conc_current, "conc_max": char.conc_max, "pa_stats": char.pa_stats,
        "status": char.status, "stats": char.stats, "weapons": char.weapons,
        "skills": char.skills, "backpack": char.backpack, "bonuses": char.bonuses, "is_hidden": char.is_hidden, 
        "is_invisible": char.is_invisible,"xp": char.xp, "shop": char.shop
    }

# ==========================================
# WEBSOCKET - CONNESSIONE
# ==========================================
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
    emit("map_update", world_state["map_url"])
# ==========================================
# GESTIONE COMBATTIMENTO
# ==========================================
@socketio.on("toggle_combat")
def handle_toggle_combat():
    global combat_state
    combat_state["is_active"] = not combat_state["is_active"]
    
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
        pos_x=data.get("x", 0),  # <-- Ora usa le coordinate fornite
        pos_y=data.get("y", 0),
        color=data.get("color", "#000000"), 
        hp_max=data.get("hp", 30), 
        hp_current=data.get("hp", 30),
        stats={"Tipo": "NPC / Nemico"}, weapons=[], skills=[], backpack=[], xp=0, shop=[],
        is_hidden=data.get("is_hidden", False) # <-- Salva l'invisibilità
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
    if "lore" in data: char.lore = data["lore"]
    if "stats" in data: char.stats = data["stats"]
    if "weapons" in data: char.weapons = data["weapons"]
    if "skills" in data: char.skills = data["skills"]
    if "backpack" in data: char.backpack = data["backpack"]
    if "bonuses" in data: char.bonuses = data["bonuses"] # <--- NUOVO SALVATAGGIO
    if "shop" in data: char.shop = data["shop"]
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

@socketio.on("set_map")
def handle_set_map(data):
    world_state["map_url"] = data.get("url", world_state["map_url"])
    world_state["map_scale"] = float(data.get("scale", 1.0))
    world_state["map_dx"] = int(data.get("dx", 0))
    world_state["map_dy"] = int(data.get("dy", 0))
    emit("map_update", world_state, broadcast=True)

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

# Gestione FOW

@socketio.on("toggle_global_fow")
def handle_toggle_global_fow(data):
    world_state["fow_enabled"] = data.get("enabled", False)
    emit("map_update", world_state, broadcast=True)

@socketio.on("reset_fow")
def handle_reset_fow():
    world_state["revealed_hexes"] = []
    emit("map_update", world_state, broadcast=True)

@socketio.on("reveal_hexes")
def handle_reveal_hexes(data):
    new_hexes = data.get("hexes", [])
    # Unisce i nuovi esagoni a quelli vecchi eliminando i duplicati
    current_set = set(world_state["revealed_hexes"])
    current_set.update(new_hexes)
    world_state["revealed_hexes"] = list(current_set)
    emit("map_update", world_state, broadcast=True)


# Gestione attacco limbs
@socketio.on("sync_limbs")
def handle_sync_limbs(data):
    combat_state["players_limbs"][str(data["char_id"])] = data["limbs"]
    emit("sync_limbs", data, broadcast=True, include_self=False)

@socketio.on("declare_attack")
def handle_declare_attack(data):
    # Invia l'allarme di attacco al difensore (e a tutti per la chat)
    emit("incoming_attack", data, broadcast=True)

@socketio.on("resolve_reaction")
def handle_resolve_reaction(data):
    # Uso .get() così se manca un dato non va in crash (KeyError)
    attacker_id = data.get("attacker_id")
    defender_id = data.get("defender_id")
    
    if not attacker_id or not defender_id: 
        return
        
    attacker = db.session.get(Character, attacker_id)
    defender = db.session.get(Character, defender_id)

    if not attacker or not defender: return

    att_speed = int(data.get("att_speed", 85))
    def_speed = int(data.get("def_speed", 100))
    weapon_name = data.get("weapon", "Mani Nude")
    reaction = data.get("reaction_type", "Schivata")
    def_limb_key = data.get("def_limb", "bd")

    # 1. Calcolo Danno Arma dell'Attaccante
    damage = 5 # Danno base Mani Nude
    if attacker.stats and "equipped" in attacker.stats and attacker.stats["equipped"]:
        for slot in ["mano_dx", "mano_sx"]:
            item = attacker.stats["equipped"].get(slot)
            if item and item.get("name") == weapon_name:
                match = re.search(r'Danno:\s*(\d+)', item.get("desc", ""), re.IGNORECASE)
                if match: damage = int(match.group(1))
                break

    # 2. Lancio Dadi Automatico (1d20 + Bonus Velocità diviso 10)
    att_roll = random.randint(1, 20) + (att_speed // 10)
    def_roll = random.randint(1, 20) + (def_speed // 10)

    chat_msgs = ["⚔️ <b>RISOLUZIONE AUTOMATICA SCONTRO</b> ⚔️",
                 f"Attacco ({weapon_name}): {att_roll} (Dado + Vel)",
                 f"Difesa ({reaction}): {def_roll} (Dado + Vel)"]

    # 3. Risoluzione della Difesa
    if reaction == "Schivata":
        if def_roll >= att_roll:
            chat_msgs.append(f"💨 <b>{defender.name}</b> schiva perfettamente l'attacco!")
        else:
            defender.hp_current = max(0, defender.hp_current - damage)
            chat_msgs.append(f"🩸 Schivata fallita! <b>{defender.name}</b> subisce <b>{damage} danni</b> (HP Rimanenti: {defender.hp_current}).")

    elif reaction == "Parata":
        armor_hp = 0
        stats_copy = dict(defender.stats) if defender.stats else {}
        equipped = stats_copy.get("equipped") or {}
        equipped_armor = equipped.get(def_limb_key)

        # Cerca i Punti Vita dell'armatura sull'arto usato per parare
        if equipped_armor:
            hp_match = re.search(r'HP:\s*(\d+)', equipped_armor.get("desc", ""), re.IGNORECASE)
            if hp_match: armor_hp = int(hp_match.group(1))

        if def_roll >= att_roll:
            chat_msgs.append(f"🛡️ <b>{defender.name}</b> para perfettamente! L'attacco è respinto senza danni.")
        else:
            dmg_to_armor = min(damage, armor_hp)
            dmg_to_player = damage - dmg_to_armor

            # Danno all'armatura
            if equipped_armor and armor_hp > 0:
                new_armor_hp = armor_hp - dmg_to_armor
                new_desc = re.sub(r'HP:\s*\d+', f'HP: {new_armor_hp}', equipped_armor["desc"], flags=re.IGNORECASE)
                stats_copy["equipped"][def_limb_key]["desc"] = new_desc
                defender.stats = stats_copy
                flag_modified(defender, "stats")
                chat_msgs.append(f"🛡️ L'armatura su {def_limb_key} si usura assorbendo {dmg_to_armor} danni (HP Armatura restanti: {new_armor_hp}).")

            # Danno in eccesso al giocatore
            if dmg_to_player > 0:
                defender.hp_current = max(0, defender.hp_current - dmg_to_player)
                chat_msgs.append(f"🩸 L'attacco trapassa la guardia! <b>{defender.name}</b> subisce <b>{dmg_to_player} danni</b> (HP Rimanenti: {defender.hp_current}).")

    elif reaction == "Scambio":
        defender.hp_current = max(0, defender.hp_current - damage)
        chat_msgs.append(f"⚔️ Nessuna difesa! <b>{defender.name}</b> accetta <b>{damage} danni</b> per colpire a sua volta (HP Rimanenti: {defender.hp_current}).")

    # 4. Salva ed Emetti i risultati
    db.session.commit()
    emit("update_character", get_char_data(defender), broadcast=True)
    
    for msg in chat_msgs:
        emit("dice_result", {"name": "SISTEMA", "message": msg, "is_master_roll": False}, broadcast=True)
if __name__ == "__main__":
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)

