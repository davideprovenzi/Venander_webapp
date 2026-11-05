"""Dati dei personaggi per i client e invio degli aggiornamenti.

Il Master riceve tutto; i giocatori vedono degli NPC solo quello che serve
per mappa e bersagli (mai HP o statistiche).
"""
import re
from flask import render_template
from venander.core import app, db, socketio
from venander.models import Character, WorldState
from venander.state import client_character_ids, client_roles, master_sids, pending_attacks


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
        "spawn_sound": char.spawn_sound,
        "loot": char.loot or []
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
        # Il bottino si vede solo quando l'NPC è a terra (prima è un segreto del Master)
        "loot": public_loot(char),
        # Il suono "solo Master" non arriva nemmeno ai giocatori
        "spawn_sound": char.spawn_sound if (char.spawn_sound or {}).get("scope") == "all" else None
    }


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


def emit_to_masters(event_name, data):
    """Invia un evento solo ai socket registrati come Master."""
    for sid in list(master_sids):
        socketio.emit(event_name, data, to=sid)


def emit_to_character(char_id, event_name, payload):
    for sid, sid_char_id in list(client_character_ids.items()):
        if sid_char_id == char_id:
            socketio.emit(event_name, payload, to=sid)


def is_lootable_corpse(char):
    return bool(char) and char.role == "npc" and (char.hp_current or 0) <= 0 and not char.is_hidden


def public_loot(char):
    if not is_lootable_corpse(char):
        return []
    result = []
    for entry in char.loot or []:
        if entry.get("kind") == "money":
            result.append({"id": entry["id"], "kind": "money", "amount": entry.get("amount", 0)})
        else:
            item = entry.get("item") or {}
            result.append({
                "id": entry["id"], "kind": entry["kind"], "qty": entry.get("qty", 1),
                "item": {k: item.get(k) for k in ("name", "compendium_id", "brand", "desc", "img", "durability_current", "durability_max")}
            })
    return result


# Al difensore mandiamo solo i dati necessari alla reazione, non il danno già calcolato.
INCOMING_ATTACK_FIELDS = (
    "attack_id", "attacker_id", "attacker_name", "defender_id", "defender_name",
    "weapon", "speed", "compendium_id", "source_slot", "damage_formula", "damage_type",
    "range", "distance", "activation_mode", "area_shape", "aim", "no_exchange"
)


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
