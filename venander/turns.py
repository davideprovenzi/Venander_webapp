"""Gestione del combattimento: inizio e fine, turni, frame e azioni della tabella.
"""
import html
import math
from flask_socketio import emit
from sqlalchemy.orm.attributes import flag_modified
from venander.aiming import emit_aims
from venander.armor_repair import ARMOR_REPAIR_ACTION
from venander.combat import LIMB_KEYS, current_combat_actor_id, is_players_turn, spend_limb_frames
from venander.compendium import get_action_speed_rule
from venander.core import db, socketio
from venander.exchange import emit_exchanges
from venander.models import Character
from venander.permissions import controls_character, emit_combat_error, is_master_request
from venander.serialization import emit_character_update, emit_to_character, emit_to_masters
from venander.state import (
    combat_aims,
    combat_state,
    combat_threats,
    pending_attacks,
    pending_combat_results,
    pending_exchanges,
)
from venander.terrain import prompt_turn_start_surface
from venander.threats import THREAT_ACTION, clear_threats_of, emit_threats
from venander.undo import undoable


@socketio.on("toggle_combat")
@undoable("Avvio/fine combattimento")
def handle_toggle_combat():
    if not is_master_request():
        return

    combat_state["is_active"] = not combat_state["is_active"]

    # Un nuovo stato di combattimento invalida richieste e risultati precedenti.
    pending_attacks.clear()
    pending_combat_results.clear()
    pending_exchanges.clear()
    emit_exchanges()
    combat_state["interrupts"] = []
    combat_threats.clear()
    emit_threats()
    combat_aims.clear()
    emit_aims()

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

        prompt_turn_start_surface(turn_order[0]["id"])

        emit("dice_result", {"name": "SISTEMA", "message": "⚔️ <b>COMBATTIMENTO INIZIATO!</b> L'ordine di turno è calcolato in base alla vicinanza all'epicentro.", "is_master_roll": True}, broadcast=True)
    else:
        combat_state["turn_order"] = []
        emit("dice_result", {"name": "SISTEMA", "message": "🕊️ <b>Combattimento terminato.</b>", "is_master_roll": True}, broadcast=True)

    emit("combat_update", combat_state, broadcast=True)


@socketio.on("next_turn")
@undoable("Fine turno")
def handle_next_turn():
    if not combat_state["is_active"] or not combat_state["turn_order"]:
        return

    # Il turno lo chiude il Master o chi controlla il personaggio di turno
    if not controls_character(db.session.get(Character, current_combat_actor_id())):
        return

    # Prima si chiudono le interruzioni in corso (il Master può forzare)
    if combat_state["interrupts"]:
        if not is_master_request():
            emit_combat_error("C'è un'interruzione in corso: aspetta che finisca.")
            return
        combat_state["interrupts"] = []

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
            emit_character_update(char)

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

    # Le minacce di chi inizia il turno scadono
    clear_threats_of(current_combat_actor_id())

    # Chi inizia il turno sopra una superficie ne subisce di nuovo l'effetto
    prompt_turn_start_surface(current_combat_actor_id())

    emit("combat_update", combat_state, broadcast=True)


@socketio.on("combat_msg")
def handle_combat_msg(data):
    if not is_master_request():
        return

    # Questo invia un messaggio di sistema senza attivare il controllo dadi!
    # Con "private_to" (es. un regalo del Master) lo vedono solo il Master e quel personaggio.
    private_to = data.get("private_to")
    if private_to is not None:
        recipient = db.session.get(Character, private_to)
        if not recipient:
            return
        message = {"name": data["name"], "message": "🔒 " + data["message"], "is_master_roll": False}
        emit_to_masters("dice_result", message)
        emit_to_character(recipient.id, "dice_result", message)
        return

    emit("dice_result", {"name": data["name"], "message": data["message"], "is_master_roll": False}, broadcast=True)


@socketio.on("sync_pa")
@undoable("Correzione frame movimento")
def handle_sync_pa(data):
    if not is_master_request():
        return

    # Salva il valore in memoria per resistere ai ricaricamenti di pagina
    combat_state["players_pa"][str(data["char_id"])] = data["pa"]
    emit("sync_pa", data, broadcast=True)


# Azioni della tabella con un comando dedicato (come DEDICATED_FIREARM_ACTIONS in static/ui/actions.js)
DEDICATED_FIREARM_ACTIONS = ("Cambiare caricatore", "Mirare con", "Sparare con")


@socketio.on("perform_table_action")
@undoable("Azione")
def handle_perform_table_action(data):
    data = data or {}
    char = db.session.get(Character, data.get("char_id"))

    if not combat_state.get("is_active") or not controls_character(char) or not is_players_turn(char):
        return

    rule = get_action_speed_rule(data.get("action"))
    if not rule or rule.get("action") in (THREAT_ACTION, ARMOR_REPAIR_ACTION):
        emit_combat_error("Azione non presente nella tabella.")
        return
    # Ricaricare, mirare e sparare hanno i loro comandi: da qui si pagherebbero
    # i frame senza caricare l'arma né prendere la mira
    if str(rule.get("action", "")).startswith(DEDICATED_FIREARM_ACTIONS):
        emit_combat_error(f"{rule.get('action')}: usa i comandi dell'arma (caricatore sulla doll, Mira, Attacco).")
        return

    try:
        cost = int(rule.get("frames"))
    except (TypeError, ValueError):
        return

    shares = data.get("limb_shares") or {}
    limb_error = spend_limb_frames(char.id, shares, cost)
    if limb_error:
        emit_combat_error(limb_error)
        return

    limb_names = {"bd": "Braccio Dx", "bs": "Braccio Sx", "gd": "Gamba Dx", "gs": "Gamba Sx"}
    split = ", ".join(
        f"{limb_names[limb]} {int(shares[limb])}"
        for limb in LIMB_KEYS
        if int(shares.get(limb) or 0)
    )

    emit("dice_result", {
        "name": char.name,
        "message": (
            f"esegue <b>{html.escape(str(rule.get('action')))}</b> "
            f"({html.escape(str(rule.get('category', '')))}, Vel {rule.get('speed')}, "
            f"<b>{cost} Frame</b>: {split})."
        ),
        "is_master_roll": False
    }, broadcast=True)


# Gestione attacco limbs
@socketio.on("set_frames")
@undoable("Modifica dei frame")
def handle_set_frames(data):
    """Il Master imposta in qualsiasi momento i frame di movimento e degli arti di un combattente."""
    if not is_master_request() or not combat_state.get("is_active"):
        return

    data = data or {}
    char = db.session.get(Character, data.get("char_id"))
    if not char:
        return

    try:
        movement = max(0, int(data.get("pa")))
        limbs = {limb: max(0, int((data.get("limbs") or {}).get(limb))) for limb in LIMB_KEYS}
    except (TypeError, ValueError):
        emit_combat_error("Frame non validi: servono numeri interi.")
        return

    combat_state["players_pa"][str(char.id)] = movement
    combat_state["players_limbs"][str(char.id)] = limbs

    socketio.emit("sync_pa", {"char_id": char.id, "pa": movement})
    socketio.emit("sync_limbs", {"char_id": char.id, "limbs": limbs})

    message = {
        "name": "👑 MASTER",
        "message": (
            f"imposta i frame di <b>{html.escape(char.name)}</b>: 🦶 {movement} · "
            f"BD {limbs['bd']} · BS {limbs['bs']} · GD {limbs['gd']} · GS {limbs['gs']}"
        ),
        "is_master_roll": False
    }
    # Gli NPC nascosti restano segreti
    if char.role == "npc" and (char.is_hidden or char.is_invisible):
        emit_to_masters("dice_result", message)
    else:
        socketio.emit("dice_result", message)


@socketio.on("sync_limbs")
@undoable("Correzione frame arti")
def handle_sync_limbs(data):
    if not is_master_request():
        return

    combat_state["players_limbs"][str(data["char_id"])] = data["limbs"]
    emit("sync_limbs", data, broadcast=True)
