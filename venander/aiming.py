"""Mira (armi a distanza).

Per sparare bisogna prima mirare: il bersaglio viene avvisato e reagisce
(un'azione della tabella o niente), poi si può sparare. La mira resta finché
qualcosa non la spezza: chi mira si muove, la linea di vista si chiude, l'arma
lascia la mano, la si abbassa o finisce il combattimento. Chi spara a un
bersaglio dentro una sua zona minacciata non deve mirare.
"""
import html
import uuid
from venander.ammo import equipped_item_compendium, firearm_spec
from venander.combat import (
    SLOT_COMBAT_LIMBS,
    get_limb_frames,
    interrupt_target_error,
    is_players_turn,
    spend_limb_frames,
)
from venander.compendium import compendium_attack_range, get_action_speed_rule
from venander.core import db, socketio
from venander.hexes import hex_distance, hex_key
from venander.models import Character, WorldState
from venander.permissions import controls_character, emit_combat_error
from venander.serialization import emit_to_masters
from venander.state import client_character_ids, combat_aims, combat_state, combat_threats
from venander.terrain import has_line_of_sight, sight_blocking_hexes
from venander.undo import undoable


def is_ranged_weapon(comp):
    return bool(firearm_spec(comp)) or "distanza" in str((comp or {}).get("type", "")).lower()


def emit_aims():
    socketio.emit("aims_update", combat_aims)


def aim_action_kind(comp, item_name):
    name = str((comp or {}).get("name") or item_name or "").lower()
    return "pistola" if any(k in name for k in ("pistol", "revolver")) else "fucile"


def spend_two_arms(char_id, slot, cost):
    """Azioni a due mani (mirare, ricaricare): paga prima il braccio dell'arma, il resto l'altro."""
    gun_arm = SLOT_COMBAT_LIMBS.get(slot, "bd")
    other_arm = "bs" if gun_arm == "bd" else "bd"
    first = min(cost, get_limb_frames(char_id)[gun_arm])
    return spend_limb_frames(char_id, {gun_arm: first, other_arm: cost - first}, cost)


def break_aims(should_break, reason):
    """Toglie le mire che non reggono più e lo annuncia in chat."""
    broken = [aim for aim in combat_aims if should_break(aim)]
    if not broken:
        return
    combat_aims[:] = [aim for aim in combat_aims if aim not in broken]
    for aim in broken:
        why = reason(aim) if callable(reason) else reason
        socketio.emit("dice_result", {
            "name": "SISTEMA",
            "message": (
                f"🎯 La mira di <b>{html.escape(aim['shooter_name'])}</b> su "
                f"<b>{html.escape(aim['target_name'])}</b> si interrompe: {html.escape(why)}."
            ),
            "is_master_roll": False
        })
    emit_aims()


def check_aims():
    """Linea di vista ancora libera e arma ancora in mano, per ogni mira."""
    if not combat_aims:
        return
    blocked = sight_blocking_hexes(WorldState.query.first())

    def broken_reason(aim):
        shooter = db.session.get(Character, aim["shooter_id"])
        target = db.session.get(Character, aim["target_id"])
        if not shooter or not target:
            return "personaggio non più in campo"
        weapon = ((shooter.stats or {}).get("equipped") or {}).get(aim["slot"])
        if not isinstance(weapon, dict) or weapon.get("name") != aim["weapon"]:
            return "l'arma non è più in mano"
        if not has_line_of_sight(shooter.pos_x, shooter.pos_y, target.pos_x, target.pos_y, blocked):
            return "linea di vista ostruita"
        return None

    reasons = {aim["id"]: broken_reason(aim) for aim in combat_aims}
    break_aims(lambda aim: reasons.get(aim["id"]), lambda aim: reasons[aim["id"]])


def target_in_shooter_threat(shooter, target):
    key = hex_key(target.pos_x, target.pos_y)
    return any(t["char_id"] == shooter.id and key in t["hexes"] for t in combat_threats)


def notify_aim_target(aim, target):
    """Il bersaglio sceglie come reagire; per gli NPC (o un giocatore assente) decide il Master."""
    sids = [sid for sid, cid in client_character_ids.items() if cid == target.id]
    if target.role == "npc" or not sids:
        emit_to_masters("aim_alert", aim)
    for sid in sids:
        socketio.emit("aim_alert", aim, to=sid)


@socketio.on("declare_aim")
@undoable("Mira")
def handle_declare_aim(data):
    data = data or {}
    shooter = db.session.get(Character, data.get("char_id"))
    target = db.session.get(Character, data.get("target_id"))

    if not combat_state.get("is_active") or not shooter or not target or shooter.id == target.id:
        return
    if not controls_character(shooter) or not is_players_turn(shooter):
        return
    target_error = interrupt_target_error(shooter, target)
    if target_error:
        emit_combat_error(target_error)
        return

    slot = data.get("slot")
    weapon = ((shooter.stats or {}).get("equipped") or {}).get(slot)
    comp = equipped_item_compendium(weapon) if isinstance(weapon, dict) else None
    if not comp or not is_ranged_weapon(comp):
        emit_combat_error("Si mira solo con un'arma a distanza equipaggiata.")
        return

    if not has_line_of_sight(shooter.pos_x, shooter.pos_y, target.pos_x, target.pos_y, sight_blocking_hexes(WorldState.query.first())):
        emit_combat_error(f"Non vedi {target.name}: la linea di vista è ostruita.")
        return

    weapon_range = compendium_attack_range(comp)
    distance = hex_distance(shooter.pos_x, shooter.pos_y, target.pos_x, target.pos_y)
    if weapon_range is not None and distance > weapon_range:
        emit_combat_error(f"{target.name} è fuori portata: {distance} m, massimo {weapon_range:g} m.")
        return

    rule = get_action_speed_rule(f"Mirare con {aim_action_kind(comp, weapon.get('name'))}")
    cost = int((rule or {}).get("frames", 0))
    if cost:
        limb_error = spend_two_arms(shooter.id, slot, cost)
        if limb_error:
            emit_combat_error(limb_error)
            return

    # Una mira alla volta: una nuova sostituisce la precedente
    combat_aims[:] = [aim for aim in combat_aims if aim["shooter_id"] != shooter.id]
    aim = {
        "id": str(uuid.uuid4()),
        "shooter_id": shooter.id,
        "shooter_name": shooter.name,
        "target_id": target.id,
        "target_name": target.name,
        "slot": slot,
        "weapon": weapon.get("name"),
        "ready": False,
        "reaction": None
    }
    combat_aims.append(aim)
    emit_aims()

    socketio.emit("dice_result", {
        "name": shooter.name,
        "message": (
            f"🎯 prende la mira su <b>{html.escape(target.name)}</b> con "
            f"<b>{html.escape(str(weapon.get('name')))}</b>" + (f" (<b>{cost} Frame</b>)." if cost else ".")
        ),
        "is_master_roll": False
    })
    notify_aim_target(aim, target)


@socketio.on("aim_response")
@undoable("Reazione alla mira")
def handle_aim_response(data):
    """Il bersaglio reagisce alla mira (anche fuori turno): un'azione della tabella o niente."""
    data = data or {}
    aim = next((a for a in combat_aims if a["id"] == data.get("aim_id")), None)
    if not aim or aim["ready"]:
        return

    target = db.session.get(Character, aim["target_id"])
    if not controls_character(target):
        return

    action = data.get("action")
    cost_text = ""
    if action:
        rule = get_action_speed_rule(action)
        if not rule or rule.get("special"):
            emit_combat_error("Azione non valida come reazione alla mira.")
            return
        cost = int(rule.get("frames", 0))
        limb_error = spend_limb_frames(target.id, data.get("limb_shares") or {}, cost)
        if limb_error:
            emit_combat_error(limb_error)
            return
        action = rule["action"]
        cost_text = f" (<b>{cost} Frame</b>)"

    aim["ready"] = True
    aim["reaction"] = action or "Nessuna reazione"
    emit_aims()

    socketio.emit("dice_result", {
        "name": target.name,
        "message": (
            f"reagisce alla mira di <b>{html.escape(aim['shooter_name'])}</b>: "
            + (f"<b>{html.escape(action)}</b>{cost_text}." if action else "nessuna reazione.")
        ),
        "is_master_roll": False
    })


@socketio.on("drop_aim")
@undoable("Mira abbassata")
def handle_drop_aim(data):
    aim = next((a for a in combat_aims if a["id"] == (data or {}).get("aim_id")), None)
    if not aim or not controls_character(db.session.get(Character, aim["shooter_id"])):
        return
    break_aims(lambda a: a["id"] == aim["id"], "abbassa la mira")
