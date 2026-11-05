"""Fucina del Master: armi personalizzate.

Il Master disegna un'arma, la salva nella libreria e la consegna a un
giocatore (direttamente o come ricompensa di una sidequest). L'arma porta con
sé la sua definizione completa (custom_definition), compatibile col compendio.
"""
import html
import uuid
from flask import request
from flask_socketio import emit
from sqlalchemy.orm.attributes import flag_modified
from venander.core import db, socketio
from venander.models import Character, MasterForgeWeapon
from venander.permissions import is_master_request
from venander.serialization import emit_character_update, emit_to_character, emit_to_masters
from venander.state import master_sids
from venander.undo import undoable
from venander.utils import _clean_float, _clean_int, _raw_text


def build_forged_weapon(raw):
    """Valida i campi della forgia e costruisce una voce compatibile col compendio."""
    if not isinstance(raw, dict):
        return None

    name = _raw_text(raw, "name", "").strip()[:120]
    if not name:
        return None

    description = _raw_text(raw, "description", "").strip()[:2000]
    brand = _raw_text(raw, "brand", "").strip()[:100] or "Forgiata dal Master"
    targeting = _raw_text(raw, "targeting", "Melee").strip().title()
    if targeting not in {"Melee", "Ranged"}:
        targeting = "Melee"

    characteristic = _raw_text(raw, "characteristic", "DES").strip().upper()[:12]
    damage = _clean_int(raw.get("damage"), 0, 0, 100000)
    damage_type = _raw_text(raw, "damage_type", "").strip()[:80] or None
    hp = _clean_int(raw.get("hp"), 100, 0, 100000)
    action_cost = _clean_int(raw.get("action_cost"), 0, 0, 100000)
    attack_speed = _clean_int(raw.get("attack_speed"), None, 1, 1000)
    hands = _clean_int(raw.get("hands"), 1, 1, 2)

    if attack_speed is None:
        return None

    ammo = _raw_text(raw, "ammo", "").strip()[:100] or None
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

    license_name = _raw_text(raw, "license_name", "").strip()[:160] or None
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


@socketio.on("master_forge_request")
def handle_master_forge_request():
    if request.sid not in master_sids:
        return
    emit("master_forge_library", get_master_forge_library(), to=request.sid)


@socketio.on("master_forge_give")
@undoable("Arma forgiata consegnata")
def handle_master_forge_give(data):
    """Il Master dà un'arma della Fucina direttamente a un giocatore (senza sidequest)."""
    if not is_master_request():
        return {"error": "Solo il Master può consegnare armi forgiate."}
    data = data or {}
    definition = build_forged_weapon(data.get("weapon"))
    if not definition:
        return {"error": "Arma non valida: controlla almeno nome, danno e velocità d'attacco."}
    definition["source"] = "Fucina del Master"

    recipient = db.session.get(Character, data.get("char_id"))
    if not recipient or recipient.role != "player":
        return {"error": "Scegli il giocatore che riceve l'arma."}

    entry = forged_weapon_inventory_entry(definition)
    recipient.weapons = list(recipient.weapons or []) + [entry]
    flag_modified(recipient, "weapons")
    db.session.commit()
    emit_character_update(recipient)

    # Come i regali del Master: lo vedono solo il Master e chi la riceve
    message = {
        "name": "🔨 FUCINA",
        "message": f"🔒 Il Master consegna <b>{html.escape(entry['name'])}</b> a <b>{html.escape(recipient.name)}</b>.",
        "is_master_roll": False
    }
    emit_to_masters("dice_result", message)
    emit_to_character(recipient.id, "dice_result", message)
    return {"ok": True, "name": entry["name"]}


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
