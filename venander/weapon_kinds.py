"""Che arma si vede in mano a un personaggio (per la vista 3D).

Solo il tipo (spada, pistola, scudo...), mai nome o statistiche: lo ricevono
anche i giocatori per gli NPC, come vedrebbero l'arma al tavolo.
Il tipo si ricava dal nome dell'oggetto e dal compendio (corpo a corpo o a
distanza). Deve coincidere con i modelli di static/board3d/layers.js (buildWeapon).
"""
import json
import os
from venander.core import app

# Parole del nome -> tipo di arma (la prima che corrisponde vince: dal più specifico)
WEAPON_KEYWORDS = (
    ("shield", ("scudo",)),
    ("rifle", ("fucile", "carabina", "rifle", "shotgun", "pompa", "mitra")),
    ("pistol", ("pistol", "revolver", "rivoltella")),
    ("halberd", ("alabarda",)),
    ("spear", ("lancia", "arpione", "picca", "tridente")),
    ("greatsword", ("spadone", "due mani")),
    ("axe", ("ascia", "accetta")),
    ("mace", ("mazza", "martello", "sfollagente", "stunbaton", "manganello", "clava")),
    ("staff", ("bastone",)),
    ("whip", ("frusta",)),
    ("dagger", ("pugnale", "coltello", "lama corta", "dagger", "tridagger", "stiletto")),
    ("sword", ("spada", "lama lunga", "katana", "sciabola", "machete")),
)

_compendium_cache = {"mtime": None, "items": {}}


def _compendium_weapons():
    """id -> (nome, tipo) delle armi del compendio, riletto solo se il file cambia."""
    path = os.path.join(app.root_path, "compendio.json")
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return {}
    if _compendium_cache["mtime"] != mtime:
        try:
            with open(path, encoding="utf-8") as handle:
                items = json.load(handle).get("items", [])
        except (OSError, json.JSONDecodeError):
            items = []
        _compendium_cache["items"] = {
            item.get("id"): (str(item.get("name") or ""), str(item.get("type") or ""))
            for item in items if item.get("class") == "Arma"
        }
        _compendium_cache["mtime"] = mtime
    return _compendium_cache["items"]


def weapon_kind(item):
    """Tipo di arma di un oggetto in mano, oppure None se non è un'arma."""
    if not isinstance(item, dict):
        return None
    custom = item.get("custom_definition") if isinstance(item.get("custom_definition"), dict) else None
    compendium_name, compendium_type = _compendium_weapons().get(item.get("compendium_id"), ("", ""))
    if custom:
        compendium_name, compendium_type = custom.get("name") or "", custom.get("type") or ""

    text = f"{item.get('name', '')} {compendium_name}".casefold()
    for kind, words in WEAPON_KEYWORDS:
        if any(word in text for word in words):
            return kind

    # Nome sconosciuto: si decide dal tipo (a distanza -> pistola, altrimenti spada)
    if "distanza" in compendium_type.casefold():
        return "pistol"
    if compendium_type or custom or item.get("original_type") == "weapon":
        return "sword"
    return None


def held_weapons(char):
    """{"dx": tipo, "sx": tipo, "two_handed": bool} delle armi nelle mani."""
    equipped = (char.stats or {}).get("equipped") or {}
    right, left = equipped.get("mano_dx"), equipped.get("mano_sx")
    two_handed = bool(
        isinstance(right, dict) and isinstance(left, dict)
        and right.get("equip_group_id") and right.get("equip_group_id") == left.get("equip_group_id")
    )
    if two_handed:
        return {"dx": weapon_kind(right), "sx": None, "two_handed": True}
    return {"dx": weapon_kind(right), "sx": weapon_kind(left), "two_handed": False}
