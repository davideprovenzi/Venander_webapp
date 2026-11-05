"""Scheda del personaggio: vitali, PA, conto, XP, abilità e salvataggio della scheda.
"""
import copy
from flask import request
from flask_socketio import emit
from venander.aiming import check_aims
from venander.ammo import auto_load_new_firearms, return_unequipped_ammo
from venander.core import db, socketio
from venander.models import Character
from venander.permissions import controls_character, emit_combat_error, is_master_request
from venander.serialization import emit_character_update
from venander.state import master_sids
from venander.stats import PA_RESET_COSTS, PA_RESET_POOLS, stat_pa_current, stat_pa_max
from venander.tokens import TOKEN_TOO_BIG_MESSAGE, token_too_big
from venander.undo import undoable


@socketio.on("update_vitals")
@undoable("Modifica dei vitali")
def handle_update_vitals(data):
    # I vitali dal pannello Entità sono controlli amministrativi del Master.
    if request.sid not in master_sids:
        return

    char_id = data.get("char_id")
    char = db.session.get(Character, char_id)
    if not char:
        return

    try:
        if "hp" in data:
            char.hp_current = max(0, min(char.hp_max, char.hp_current + int(data["hp"])))
        if "stamina" in data:
            char.stamina_current = max(0, min(char.stamina_max, char.stamina_current + int(data["stamina"])))
        if "conc" in data:
            char.conc_current = max(0, min(char.conc_max, char.conc_current + int(data["conc"])))
    except (TypeError, ValueError):
        return

    if "status" in data:
        char.status = str(data["status"])

    db.session.commit()
    emit_character_update(char)


@socketio.on("spend_pa")
@undoable("Spesa di PA")
def handle_spend_pa(data):
    char_id = data.get("char_id")
    stat_key = data.get("stat")
    amount = int(data.get("amount", 1))

    char = db.session.get(Character, char_id)
    if not controls_character(char): return

    current_pa_stats = dict(char.pa_stats) if char.pa_stats else {}
    current_pa_stats[stat_key] = stat_pa_current(char, stat_key)

    if current_pa_stats[stat_key] > 0 and amount > 0:
        actual_spent = min(amount, current_pa_stats[stat_key])
        current_pa_stats[stat_key] -= actual_spent
        char.pa_stats = current_pa_stats

        db.session.commit()
        emit_character_update(char)
        emit("dice_result", {"name": char.name, "message": f"ha speso {actual_spent} PA di <b>{stat_key}</b>.", "is_master_roll": False}, broadcast=True)


@socketio.on("reset_pa")
@undoable("Ricarica PA")
def handle_reset_pa(data):
    char_id = data.get("char_id")
    stat_key = data.get("stat")

    char = db.session.get(Character, char_id)
    if not controls_character(char): return

    # La risorsa da pagare dipende dalla caratteristica, non da cosa chiede il client
    reset = PA_RESET_COSTS.get(stat_key)
    if not reset:
        return
    pool, cost = reset
    attribute, label = PA_RESET_POOLS[pool]
    available = getattr(char, attribute) or 0

    # Con la salute non ci si può mettere KO da soli: deve restare almeno 1 HP
    if available < cost or (pool == "hp" and available <= cost):
        emit_combat_error(f"Non hai abbastanza {label} per ricaricare i PA di {stat_key}: servono {cost}.")
        return

    setattr(char, attribute, available - cost)
    current_pa_stats = dict(char.pa_stats) if char.pa_stats else {}
    current_pa_stats[stat_key] = stat_pa_max(char, stat_key)
    char.pa_stats = current_pa_stats

    db.session.commit()
    emit_character_update(char)
    emit("dice_result", {"name": char.name, "message": f"ha speso {cost} {label} per ripristinare i PA di <b>{stat_key}</b>!", "is_master_roll": False}, broadcast=True)


@socketio.on("master_set_bank")
def handle_master_set_bank(data):
    # Modifica amministrativa del conto: solo il Master può impostare il saldo.
    if request.sid not in master_sids:
        return

    char = db.session.get(Character, data.get("char_id"))
    if not char or char.role != "player":
        return

    try:
        # Nessun clamp a zero: il conto può andare in negativo.
        char.xp = int(data.get("value", 0))
    except (TypeError, ValueError):
        return

    db.session.commit()
    emit_character_update(char)


@socketio.on("update_xp")
def handle_update_xp(data):
    char = db.session.get(Character, data.get("char_id"))
    if not controls_character(char): return
    try:
        amount = int(data.get("amount", 0))
        # I giocatori possono solo spendere (acquisti nel negozio); dare soldi spetta al Master
        if not is_master_request() and (amount > 0 or char.xp + amount < 0): return
        char.xp = max(0, char.xp + amount)
        db.session.commit()
        emit_character_update(char)
    except (TypeError, ValueError): return


@socketio.on("update_character_sheet")
# Annullabile come le altre azioni: senza una sua voce, il primo "Annulla"
# del Master riportava indietro anche armi equipaggiate e oggetti spostati
@undoable("Modifica scheda")
def handle_update_character_sheet(data):
    char = db.session.get(Character, data.get("char_id"))
    if not controls_character(char): return
    if "photo_url" in data: char.photo_url = data["photo_url"]
    if "token_url" in data:
        # Il limite vale per le immagini nuove: quella già salvata resta valida
        if data["token_url"] != char.token_url and token_too_big(data["token_url"]):
            emit_combat_error(TOKEN_TOO_BIG_MESSAGE)
            return
        char.token_url = data["token_url"]
    if "lore" in data: char.lore = data["lore"]
    if "stats" in data:
        backpack = copy.deepcopy(data["backpack"] if "backpack" in data else (char.backpack or []))
        if isinstance(backpack, list) and return_unequipped_ammo(char.stats, data["stats"], backpack):
            data = {**data, "backpack": backpack}
        char.stats = data["stats"]
    if "weapons" in data: char.weapons = data["weapons"]
    if "skills" in data: char.skills = data["skills"]
    if "backpack" in data: char.backpack = data["backpack"]
    if "bonuses" in data: char.bonuses = data["bonuses"]
    if "shop" in data: char.shop = data["shop"]
    if "notes" in data: char.notes = data["notes"]
    if "knowledge" in data: char.knowledge = clean_knowledge(data["knowledge"])
    if "stats" in data or "backpack" in data: auto_load_new_firearms(char)
    if "stats" in data: check_aims()
    db.session.commit()
    emit_character_update(char)


def clean_knowledge(raw):
    """Conoscenze: solo nome e descrizione, testo semplice."""
    entries = []
    for entry in raw if isinstance(raw, list) else []:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name", "")).strip()[:80]
        if name:
            entries.append({"name": name, "desc": str(entry.get("desc", "")).strip()[:500]})
    return entries[:100]


@socketio.on("buy_skill")
def handle_buy_skill(data):
    char = db.session.get(Character, data.get("char_id"))
    if not controls_character(char): return

    skill_name = data.get("skill_name")

    # Il prezzo viene dal negozio del personaggio, non dal client
    shop_item = next(
        (item for item in (char.shop or []) if isinstance(item, dict) and item.get("name") == skill_name),
        None
    )
    if not shop_item and not is_master_request(): return
    try:
        cost = int((shop_item or {}).get("cost", data.get("cost", 0)))
    except (TypeError, ValueError):
        return

    current_skills = list(char.skills) if char.skills else []
    if char.xp < cost or not skill_name or skill_name in current_skills: return

    char.xp -= cost
    if "Nessuna abilità" in current_skills: current_skills.remove("Nessuna abilità")
    current_skills.append(skill_name)
    char.skills = current_skills

    if data.get("stat_bonus") and isinstance(char.stats, dict):
        current_stats = dict(char.stats)
        stat_key = data["stat_bonus"].get("stat")
        if stat_key in current_stats:
            current_stats[stat_key] = int(current_stats[stat_key]) + int(data["stat_bonus"].get("val", 0))
            char.stats = current_stats

    db.session.commit()
    emit_character_update(char)


@socketio.on("add_skill_to_shop")
def handle_add_skill_to_shop(data):
    if not is_master_request():
        return

    char = db.session.get(Character, data.get("char_id"))
    skill_data = data.get("skill")
    if not char or not skill_data: return

    current_shop = list(char.shop) if char.shop else []
    if any(item.get("name") == skill_data.get("name") for item in current_shop): return

    current_shop.append(skill_data)
    char.shop = current_shop
    db.session.commit()
    emit_character_update(char)
