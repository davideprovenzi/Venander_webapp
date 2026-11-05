"""Modelli del database (SQLite in instance/).
"""
from venander.core import db


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
    loot = db.Column(db.JSON, default=list) # bottino che il Master lascia prendere dal corpo
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
