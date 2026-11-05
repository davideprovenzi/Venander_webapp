"""Trinket Umbryll.

I gadget "Trinket ..." trasformano le clip "Trinket marca Umbryll" dello
zaino: si piazzano (trappola, la vedono solo chi l'ha messa e il Master) o si
lanciano (visibili a tutti). Le bombe si fanno esplodere a distanza: chi è
nell'area ha una risposta, poi il Master rivede i danni.
"""
import copy
import html
import uuid
from sqlalchemy.orm.attributes import flag_modified
from venander.ammo import ammo_qty
from venander.combat import in_combat_turn_order, is_players_turn, spend_arms, spend_limb_frames
from venander.compendium import char_owned_items, get_action_speed_rule, get_compendium_item
from venander.core import db, socketio
from venander.equipment import armor_pieces, set_equipment_current_hp
from venander.hexes import hex_distance, hex_key, hex_line
from venander.models import Character, WorldState
from venander.permissions import controls_character, emit_combat_error, is_master_request
from venander.serialization import emit_character_update, emit_to_character, emit_to_masters
from venander.state import client_character_ids, client_roles, pending_explosions
from venander.stats import stat_pa_current
from venander.terrain import has_line_of_sight, sight_blocking_hexes, wall_hexes
from venander.undo import float_text, undoable


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
        if not isinstance(entry, dict) or ammo_qty(entry.get("qty", 1)) <= 0:
            continue
        if entry.get("compendium_id") == TRINKET_CLIP_ID or "trinket marca umbryll" in str(entry.get("name", "")).lower():
            return index
    return None


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
