"""NPC e modelli di NPC.

I modelli conservano statistiche, equipaggiamento e armi pronti da spawnare.
"""
import copy
import html
from flask import request
from flask_socketio import emit
from sqlalchemy.orm.attributes import flag_modified
from venander.core import db, movement_lock, socketio
from venander.models import Character, NpcTemplate, NpcTokenPreset
from venander.permissions import emit_combat_error, is_master_request
from venander.serialization import clean_character_name, emit_character_update, emit_to_masters
from venander.sounds import save_sound_data_url
from venander.state import master_sids
from venander.tokens import TOKEN_TOO_BIG_MESSAGE, token_too_big


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

        # Il limite vale per le immagini nuove: le pedine già salvate nei modelli
        # o nella libreria restano valide anche se più grandi
        spawn_token = data.get("token_url", "")
        known_tokens = set()
        if data.get("template_id"):
            known_template = db.session.get(NpcTemplate, data.get("template_id"))
            if known_template:
                known_tokens.add((known_template.data or {}).get("token_url") or "")
        if spawn_token and spawn_token not in known_tokens and token_too_big(spawn_token):
            if not NpcTokenPreset.query.filter_by(image_data=spawn_token).first():
                emit_combat_error(TOKEN_TOO_BIG_MESSAGE)
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
            "sound": data.get("sound"),
            "category": data.get("category") or "",
            "favorite": bool(data.get("favorite"))
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

    previous = template.data or {}
    template.data = snapshot_npc_template(char)
    template.data["sound"] = copy.deepcopy(char.spawn_sound) or previous.get("sound")
    # Cartella e preferito: quelli scelti ora, altrimenti restano quelli di prima
    category = data.get("category")
    template.data["category"] = clean_template_category(category) if category is not None else previous.get("category", "")
    template.data["favorite"] = bool(previous.get("favorite"))
    flag_modified(template, "data")
    db.session.commit()

    emit_to_masters("npc_template_list", get_npc_template_list())
    emit("dice_result", {
        "name": "SISTEMA",
        "message": f"📋 Modello NPC <b>{html.escape(name)}</b> salvato.",
        "is_master_roll": True
    }, to=request.sid)


def clean_template_category(value):
    """Nome della cartella di un modello NPC: testo semplice, corto ("" = nessuna cartella)."""
    return " ".join(str(value or "").split())[:40]


@socketio.on("set_npc_template_meta")
def handle_set_npc_template_meta(data):
    """Il Master mette un modello in una cartella o lo segna come preferito."""
    if not is_master_request():
        return {"error": "Solo il Master può organizzare i modelli."}
    data = data or {}
    template = db.session.get(NpcTemplate, data.get("id"))
    if not template:
        return {"error": "Modello NPC non trovato."}

    meta = dict(template.data or {})
    if "category" in data:
        meta["category"] = clean_template_category(data.get("category"))
    if "favorite" in data:
        meta["favorite"] = bool(data.get("favorite"))
    template.data = meta
    flag_modified(template, "data")
    db.session.commit()
    emit_to_masters("npc_template_list", get_npc_template_list())
    return {"ok": True}


@socketio.on("rename_npc_template_category")
def handle_rename_npc_template_category(data):
    """Rinomina (o svuota, con nome vuoto) una cartella per tutti i modelli che ci stanno."""
    if not is_master_request():
        return {"error": "Solo il Master può organizzare i modelli."}
    data = data or {}
    old = clean_template_category(data.get("old"))
    new = clean_template_category(data.get("new"))
    if not old:
        return {"error": "Cartella non valida."}
    for template in NpcTemplate.query.all():
        if (template.data or {}).get("category") == old:
            template.data = {**template.data, "category": new}
            flag_modified(template, "data")
    db.session.commit()
    emit_to_masters("npc_template_list", get_npc_template_list())
    return {"ok": True}


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


@socketio.on("toggle_invisible")
def handle_toggle_invisible(data):
    if not is_master_request():
        return

    char = db.session.get(Character, data.get("char_id"))
    if char and char.role != "master":
        char.is_invisible = bool(data.get("is_invisible", False))
        db.session.commit()
        emit("character_invisible_update", {"id": char.id, "is_invisible": char.is_invisible}, broadcast=True)
