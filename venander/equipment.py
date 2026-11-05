"""Armi e armature equipaggiate: arma che attacca, danni, durabilità dei pezzi.
"""
import math
import re
from sqlalchemy.orm.attributes import flag_modified
from venander.compendium import get_compendium_item
from venander.stats import character_stat


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
    damage_data = (comp_item.get("combat") or {}).get("damage") or {}
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
