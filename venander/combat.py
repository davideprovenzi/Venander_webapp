"""Regole di base del combattimento: turni, arti e frame.

Ogni arto ha i suoi frame per turno; le azioni li spendono. Fuori dal
combattimento i frame non contano.
"""
from venander.core import socketio
from venander.permissions import is_master_request
from venander.state import combat_state


LIMB_KEYS = ("bd", "bs", "gd", "gs")

DEFAULT_LIMB_FRAMES = 60

DEFAULT_MOVE_FRAMES = 120


def current_combat_actor_id():
    if not combat_state.get("is_active") or not combat_state.get("turn_order"):
        return None

    try:
        return int(combat_state["turn_order"][combat_state["current_index"]]["id"])
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def acting_combatant_id():
    """Chi può agire ora: chi sta interrompendo con Minacciare, altrimenti chi è di turno."""
    if combat_state.get("interrupts"):
        return combat_state["interrupts"][0]["threatener_id"]
    return current_combat_actor_id()


def interrupt_target_error(attacker, target):
    """Durante l'interruzione di una minaccia si colpisce solo chi è entrato nell'area."""
    interrupt = (combat_state.get("interrupts") or [None])[0]
    if not combat_state.get("is_active") or not interrupt:
        return None
    if attacker.id != interrupt["threatener_id"]:
        return f"Ora agisce solo {interrupt['threatener_name']} (minaccia scattata)."
    if target.id != interrupt["intruder_id"]:
        return f"Nella minaccia puoi bersagliare solo {interrupt['intruder_name']}, che è entrato nell'area."
    return None


def is_players_turn(char):
    """In combattimento un giocatore agisce solo nel proprio turno; il Master sempre."""
    if is_master_request() or not combat_state.get("is_active"):
        return True

    return acting_combatant_id() == char.id


def get_limb_frames(char_id):
    limbs = combat_state["players_limbs"].setdefault(
        str(char_id),
        {limb: DEFAULT_LIMB_FRAMES for limb in LIMB_KEYS}
    )

    for limb in LIMB_KEYS:
        limbs.setdefault(limb, DEFAULT_LIMB_FRAMES)

    return limbs


def spend_limb_frames(char_id, shares, cost):
    """Scala il costo diviso tra più arti. Restituisce un messaggio d'errore o None."""
    clean_shares = {}

    for limb, amount in (shares or {}).items():
        if limb not in LIMB_KEYS:
            return "Arto non valido."
        try:
            amount = int(amount)
        except (TypeError, ValueError):
            return "Ripartizione dei frame non valida."
        if amount < 0:
            return "Ripartizione dei frame non valida."
        if amount:
            clean_shares[limb] = amount

    if sum(clean_shares.values()) != cost:
        return f"La ripartizione dei frame non corrisponde al costo ({cost})."

    # Fuori combattimento i frame non contano: scalarli li lasciava a zero
    # (si ricaricano solo all'inizio di un combattimento) e poi non si attaccava più
    if not combat_state.get("is_active"):
        return None

    limbs = get_limb_frames(char_id)

    for limb, amount in clean_shares.items():
        if limbs[limb] < amount:
            return f"Frame insufficienti nell'arto {limb.upper()}: ne servono {amount}, ne hai {limbs[limb]}."

    for limb, amount in clean_shares.items():
        limbs[limb] -= amount

    socketio.emit("sync_limbs", {"char_id": char_id, "limbs": limbs})
    return None


def in_combat_turn_order(char):
    return combat_state.get("is_active") and any(int(e.get("id", -1)) == char.id for e in combat_state.get("turn_order", []))


def spend_arms(char_id, cost):
    """Azioni con le mani senza un'arma precisa: prima il braccio destro, il resto il sinistro."""
    limbs = get_limb_frames(char_id)
    if limbs["bd"] + limbs["bs"] < cost:
        return f"Servono {cost} frame nelle braccia, ne hai {limbs['bd'] + limbs['bs']}."
    first = min(cost, limbs["bd"])
    return spend_limb_frames(char_id, {"bd": first, "bs": cost - first}, cost)


# Arto con cui si attacca, deciso dallo slot dell'arma (uguale a getSlotCombatLimb in static/ui/attack_panel.js).
# Cintura, petto, schiena ecc. non sono legati a un arto: lì sceglie il giocatore.
SLOT_COMBAT_LIMBS = {
    "mano_dx": "bd", "guanto_dx": "bd", "avambr_dx": "bd", "spalla_dx": "bd",
    "mano_sx": "bs", "guanto_sx": "bs", "avambr_sx": "bs", "spalla_sx": "bs",
    "stivale_dx": "gd", "stivale_sx": "gs"
}

UNARMED_LIMBS = {"pugno dx": "bd", "pugno sx": "bs"}
