"""Compendio: oggetti, prezzi, licenze e oggetti personalizzati del Master.

Il file compendio.json nasce da un foglio di calcolo; il Master può
aggiungere oggetti e cambiare prezzi, salvati nel database.
"""
import copy
import json
import os
import re
from flask_socketio import emit
from sqlalchemy.orm.attributes import flag_modified
from venander.core import app, db, socketio
from venander.models import CustomCompendiumItem, ItemPriceOverride
from venander.permissions import emit_combat_error, is_master_request


def char_owned_items(char):
    """Oggetti posseduti: zaino, equipaggiamento e gadget equipaggiati."""
    stats = char.stats or {}
    equipped = [v for v in (stats.get("equipped") or {}).values() if isinstance(v, dict)]
    gadgets = [v for v in (stats.get("equipped_gadgets") or {}).values() if isinstance(v, dict)]
    backpack = [v for v in (char.backpack or []) if isinstance(v, dict)]
    return backpack, equipped + gadgets


def load_compendio():
    path = os.path.join(app.root_path, "compendio.json")
    if not os.path.exists(path): return {}
    try:
        with open(path, "r", encoding="utf-8") as f: compendio = json.load(f)
    except (json.JSONDecodeError, OSError): return {}

    # Aggiunte del Master salvate nel database: non si perdono se il
    # compendio viene rigenerato dal foglio di calcolo
    items = compendio.setdefault("items", [])
    custom_items = [custom.data for custom in CustomCompendiumItem.query.all()]
    items.extend(custom_items)

    overrides = {o.compendium_id: o.cost_eur for o in ItemPriceOverride.query.all()}
    for item in items:
        if item.get("id") in overrides:
            item.setdefault("equipment", {})["cost_eur"] = overrides[item["id"]]

    apply_license_prices(items, {c.get("id") for c in custom_items})
    return compendio


# Una licenza costa il 25% dell'arma standard che abilita (quella del compendio,
# non le varianti create dal Master): segue il prezzo dell'arma nel Listino.
LICENSE_PRICE_SHARE = 0.25


def apply_license_prices(items, custom_ids):
    standard_weapons = {}
    for item in items:
        if item.get("class") != "Arma":
            continue
        weapon = item.get("weapon") or {}
        for key in (weapon.get("license_id"), str(weapon.get("license_name") or "").casefold()):
            if not key:
                continue
            # Le armi del compendio vincono su quelle create dal Master
            if key not in standard_weapons or standard_weapons[key].get("id") in custom_ids:
                standard_weapons[key] = item

    for item in items:
        if item.get("class") != "Licenza":
            continue
        base = standard_weapons.get(item.get("id")) or standard_weapons.get(str(item.get("name", "")).casefold())
        if not base:
            continue   # licenza senza arma collegata: resta il prezzo deciso dal Master
        base_cost = (base.get("equipment") or {}).get("cost_eur")
        try:
            price = int(float(base_cost) * LICENSE_PRICE_SHARE + 0.5) if base_cost not in (None, "") else None
        except (TypeError, ValueError):
            price = None
        item.setdefault("equipment", {})["cost_eur"] = price
        item["price_rule"] = {"percent": int(LICENSE_PRICE_SHARE * 100), "base_id": base.get("id"), "base_name": base.get("name")}


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

    # Il prezzo delle licenze collegate a un'arma si calcola da solo (25% dell'arma)
    if (get_compendium_item(compendium_id=compendium_id) or {}).get("price_rule"):
        emit_combat_error("Il prezzo di questa licenza è il 25% dell'arma: cambia il prezzo dell'arma.")
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


def comparable_item_name(name):
    """Nome per i confronti: maiuscole e "Licenza" davanti non contano.

    Le armi della Fucina scrivono la licenza a mano ("lame corte"), mentre
    nello zaino c'è "Licenza Lame Corte": devono valere come la stessa.
    Deve coincidere con comparableItemName in static/ui/compendium.js.
    """
    text = " ".join(str(name or "").split()).casefold()
    return text[len("licenza "):] if text.startswith("licenza ") else text


def character_owns_compendium_item(character, compendium_id=None, name=None):
    """Controlla zaino e lista armi senza dipendere dalla forma legacy dei dati."""
    if not character:
        return False

    wanted_name = comparable_item_name(name)

    for collection in (character.backpack or [], character.weapons or []):
        for entry in collection:
            if isinstance(entry, str):
                if wanted_name and comparable_item_name(entry) == wanted_name:
                    return True
                continue

            if not isinstance(entry, dict):
                continue

            if compendium_id and entry.get("compendium_id") == compendium_id:
                return True

            if wanted_name:
                if comparable_item_name(entry.get("name")) == wanted_name:
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

    speed = (item.get("activation") or {}).get("speed") or {}
    raw = speed.get("effect_or_action")

    if raw is None:
        raw = speed.get("activation")

    return numeric_speed(raw)


def compendium_attack_range(item):
    if not item:
        return None

    combat = item.get("combat") or {}
    raw_range = (combat.get("range") or {}).get("max_m")

    if raw_range not in (None, ""):
        try:
            return float(raw_range)
        except (TypeError, ValueError):
            pass

    item_type = str(item.get("type", "")).casefold()
    mode = str((item.get("activation") or {}).get("mode", "")).casefold()

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
