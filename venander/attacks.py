"""Attacchi: dichiarazione, reazione del difensore e revisione del Master.

L'attaccante dichiara arma e bersaglio, il difensore reagisce (parata,
schivata o scambio d'attacco), poi il Master conferma il risultato prima che
arrivi a tutti.
"""
import html
import random
import re
import uuid
from flask import request
from flask_socketio import emit
from venander.aiming import check_aims, is_ranged_weapon, target_in_shooter_threat
from venander.ammo import ammo_qty, auto_load_new_firearms, firearm_spec, set_loaded_ammo
from venander.combat import (
    LIMB_KEYS,
    SLOT_COMBAT_LIMBS,
    UNARMED_LIMBS,
    interrupt_target_error,
    is_players_turn,
    spend_limb_frames,
)
from venander.compendium import (
    compendium_attack_range,
    compendium_attack_speed,
    get_action_speed_rule,
    get_compendium_item,
    missing_weapon_license,
)
from venander.core import db, socketio
from venander.equipment import (
    AIM_AREAS,
    armor_pieces,
    default_armor_slot,
    get_equipped_attack_item,
    resolve_attack_damage,
    set_equipment_current_hp,
)
from venander.exchange import build_counter_attack, start_exchange
from venander.hexes import hex_distance, hex_key, hex_line
from venander.models import Character, CombatModifier, WorldState
from venander.permissions import controls_character, emit_combat_error, is_master_request
from venander.serialization import emit_character_update, emit_to_masters, incoming_attack_payload
from venander.state import combat_aims, combat_state, master_sids, pending_attacks, pending_combat_results
from venander.terrain import has_line_of_sight, sight_blocking_hexes
from venander.undo import float_text, undoable


def detect_attack_situations(attacker, defender, aim):
    """Situazioni dello scontro che possono dare un bonus/malus all'attacco.

    Ognuna porta il valore salvato dal Master (None = mai decisa).
    """
    ws = WorldState.query.first()
    terrain = ws.terrain or {}
    situations = []

    if aim in AIM_AREAS:
        situations.append((f"mira_{aim}", f"Mira: {AIM_AREAS[aim][0]}"))

    # Copertura: sull'esagono del difensore o su quello subito prima lungo la linea di tiro
    # (mai l'esagono dell'attaccante, che c'è quando sono adiacenti)
    line = hex_line(attacker.pos_x, attacker.pos_y, defender.pos_x, defender.pos_y)
    cover_hexes = line[1:][-2:]
    covers = {terrain.get(hex_key(col, row)) for col, row in cover_hexes}
    if "copertura_totale" in covers:
        situations.append(("copertura_totale", "Bersaglio in copertura totale"))
    elif "copertura_parziale" in covers:
        situations.append(("copertura_parziale", "Bersaglio in copertura parziale"))

    attacker_high = terrain.get(hex_key(attacker.pos_x, attacker.pos_y)) == "altura"
    defender_high = terrain.get(hex_key(defender.pos_x, defender.pos_y)) == "altura"
    if attacker_high and not defender_high:
        situations.append(("altura_attaccante", "Attaccante in altura"))
    if defender_high and not attacker_high:
        situations.append(("altura_difensore", "Difensore in altura"))

    if not has_line_of_sight(attacker.pos_x, attacker.pos_y, defender.pos_x, defender.pos_y, sight_blocking_hexes(ws)):
        situations.append(("senza_vista", "Nessuna linea di vista"))

    return [
        {"key": key, "label": label, "value": saved.value if saved else None}
        for key, label in situations
        for saved in [db.session.get(CombatModifier, key)]
    ]


def saved_custom_modifiers():
    """Situazioni aggiunte a mano dal Master: si possono ripescare nella revisione."""
    return [
        {"key": m.key, "label": m.label, "value": m.value}
        for m in CombatModifier.query.filter(CombatModifier.key.like("custom_%")).order_by(CombatModifier.label).all()
    ]


def save_combat_modifiers(raw_modifiers):
    """Salva i modificatori applicati dal Master per riproporli le volte successive."""
    for raw in raw_modifiers if isinstance(raw_modifiers, list) else []:
        if not isinstance(raw, dict) or not raw.get("applied"):
            continue
        key = re.sub(r"[^a-z0-9_]", "", str(raw.get("key", "")).lower())[:80]
        label = str(raw.get("label", "")).strip()[:120]
        try:
            value = int(raw.get("value"))
        except (TypeError, ValueError):
            continue
        if not key or not label:
            continue
        modifier = db.session.get(CombatModifier, key) or CombatModifier(key=key)
        modifier.label = label
        modifier.value = value
        db.session.merge(modifier)


@socketio.on("declare_attack")
@undoable("Attacco")
def handle_declare_attack(data):
    data = data or {}

    attacker = db.session.get(Character, data.get("attacker_id"))
    defender = db.session.get(Character, data.get("defender_id"))

    if not attacker or not defender or attacker.id == defender.id:
        return

    if not controls_character(attacker) or not is_players_turn(attacker):
        return

    target_error = interrupt_target_error(attacker, defender)
    if target_error:
        emit_combat_error(target_error)
        return

    # Un giocatore non può colpire ciò che non vede (nascosto o invisibile)
    if not is_master_request() and defender.role == "npc" and (defender.is_hidden or defender.is_invisible):
        return

    aim = data.get("aim") if data.get("aim") in AIM_AREAS else None

    attack_limb = str(data.get("limb", "bd"))
    if attack_limb not in LIMB_KEYS:
        attack_limb = "bd"

    requested_name = str(data.get("weapon", "Mani Nude")).strip() or "Mani Nude"
    source_slot = data.get("source_slot") or None
    compendium_id = data.get("compendium_id") or None

    is_unarmed = requested_name.casefold() in {"pugno dx", "pugno sx", "mani nude"}

    equipped_slot, equipped_item = get_equipped_attack_item(
        attacker,
        source_slot=source_slot,
        compendium_id=compendium_id,
        weapon_name=requested_name
    )

    # Un'arma su una mano, un guanto, un avambraccio... si usa con quell'arto
    weapon_limb = UNARMED_LIMBS.get(requested_name.casefold()) or SLOT_COMBAT_LIMBS.get(equipped_slot or source_slot)
    if weapon_limb:
        attack_limb = weapon_limb

    # Se il client dichiara uno slot/id del compendio, l'oggetto deve essere davvero equipaggiato.
    if not is_unarmed and (source_slot or compendium_id) and not equipped_item:
        emit(
            "dice_result",
            {
                "name": "SISTEMA",
                "message": "⚠️ Attacco rifiutato: l'oggetto selezionato non risulta equipaggiato.",
                "is_master_roll": False
            },
            to=request.sid
        )
        return

    if not compendium_id and equipped_item:
        compendium_id = equipped_item.get("compendium_id")

    custom_definition = (equipped_item or {}).get("custom_definition")
    if isinstance(custom_definition, dict):
        comp_item = custom_definition
    else:
        comp_item = get_compendium_item(
            compendium_id=compendium_id,
            name=(equipped_item or {}).get("name") if equipped_item else requested_name
        )

    weapon_name = (
        comp_item.get("name")
        if comp_item
        else (equipped_item or {}).get("name", requested_name)
    )

    required_license = missing_weapon_license(
        attacker,
        comp_item
    )

    if required_license:
        emit(
            "dice_result",
            {
                "name": "SISTEMA",
                "message": (
                    "🔒 Attacco rifiutato: manca la licenza "
                    f"<b>{html.escape(str(required_license))}</b>."
                ),
                "is_master_roll": False
            },
            to=request.sid
        )
        return

    server_speed = compendium_attack_speed(comp_item)

    if server_speed is None:
        try:
            server_speed = int(data.get("speed"))
        except (TypeError, ValueError):
            server_speed = None

    if server_speed is None or server_speed <= 0:
        emit(
            "dice_result",
            {
                "name": "SISTEMA",
                "message": "⚠️ Attacco rifiutato: velocità non valida.",
                "is_master_roll": False
            },
            to=request.sid
        )
        return

    distance = hex_distance(
        attacker.pos_x,
        attacker.pos_y,
        defender.pos_x,
        defender.pos_y
    )

    attack_range = compendium_attack_range(comp_item)
    if is_unarmed and attack_range is None:
        attack_range = 1.0

    if attack_range is not None and distance > attack_range:
        emit(
            "dice_result",
            {
                "name": "SISTEMA",
                "message": (
                    f"⚠️ Bersaglio fuori range: {distance} m, "
                    f"massimo {attack_range:g} m."
                ),
                "is_master_roll": False
            },
            to=request.sid
        )
        return

    # Armi a distanza: prima si mira (o il bersaglio è nella zona minacciata)
    ranged_shot_label = None
    if is_ranged_weapon(comp_item) and combat_state.get("is_active"):
        check_aims()
        aim_on_target = next(
            (a for a in combat_aims if a["shooter_id"] == attacker.id and a["target_id"] == defender.id),
            None
        )
        if target_in_shooter_threat(attacker, defender):
            ranged_shot_label = "Nella zona minacciata"
        elif aim_on_target and aim_on_target["ready"]:
            ranged_shot_label = f"Mirato ({aim_on_target['reaction']})"
        elif aim_on_target:
            emit_combat_error(f"Aspetta che {defender.name} reagisca alla mira.")
            return
        else:
            emit_combat_error(f"Prima devi prendere la mira su {defender.name}.")
            return

    # Arma da fuoco: serve almeno un colpo nel caricatore
    loaded_ammo = None
    if firearm_spec(comp_item) and equipped_item and equipped_slot:
        if "ammo_loaded" not in equipped_item:
            auto_load_new_firearms(attacker)
            equipped_item = ((attacker.stats or {}).get("equipped") or {}).get(equipped_slot) or equipped_item
        loaded_ammo = equipped_item.get("ammo_loaded") or {}
        if ammo_qty(loaded_ammo.get("count")) < 1:
            db.session.commit()
            emit_combat_error(f"{weapon_name} è scarica: ricarica prima di sparare.")
            return

    damage_data = ((comp_item or {}).get("combat") or {}).get("damage") or {}
    activation = ((comp_item or {}).get("activation") or {})
    area = ((comp_item or {}).get("combat") or {}).get("area") or {}

    damage_resolution = resolve_attack_damage(
        comp_item,
        attacker,
        distance,
        weapon_name=weapon_name
    )

    # Il costo dell'attacco si paga con l'arto scelto, solo dopo tutti i controlli
    limb_error = spend_limb_frames(attacker.id, {attack_limb: max(0, 110 - server_speed)}, max(0, 110 - server_speed))
    if limb_error:
        emit_combat_error(limb_error)
        return

    if loaded_ammo is not None:
        set_loaded_ammo(attacker, equipped_slot, {**loaded_ammo, "count": ammo_qty(loaded_ammo.get("count")) - 1})
        db.session.commit()
        emit_character_update(attacker)

    attack_id = str(uuid.uuid4())

    attack = {
        "attack_id": attack_id,
        "attacker_id": attacker.id,
        "attacker_name": attacker.name,
        "defender_id": defender.id,
        "defender_name": defender.name,
        "weapon": weapon_name,
        "speed": server_speed,
        "compendium_id": compendium_id,
        "source_slot": equipped_slot or source_slot,
        "damage_formula": damage_data.get("formula"),
        "damage_type": damage_data.get("type"),
        "resolved_damage": damage_resolution.get("damage"),
        "resolved_damage_formula": damage_resolution.get("formula"),
        "damage_automatic": damage_resolution.get("automatic", False),
        "damage_note": damage_resolution.get("note"),
        "range": attack_range,
        "distance": distance,
        "activation_mode": activation.get("mode"),
        "area_shape": area.get("shape"),
        "aim": aim
    }

    pending_attacks[attack_id] = attack

    # La dichiarazione dell'attacco è pubblica, ma nessun tiro/danno viene ancora pubblicato.
    emit(
        "dice_result",
        {
            "name": attacker.name,
            "message": (
                f"sferra un attacco con <b>{html.escape(str(weapon_name))}</b> "
                f"contro <b>{html.escape(str(defender.name))}</b> "
                f"a Velocità <b>{server_speed}</b>!"
            ),
            "is_master_roll": False
        },
        broadcast=True
    )

    # Colpo mirato (o nella zona minacciata): il bersaglio ha già reagito alla mira,
    # il colpo va dritto alla revisione del Master
    if ranged_shot_label:
        build_pending_result(attack, attacker, defender, "Nessuna", ranged_shot_label, 0, "bd")
        return

    emit("incoming_attack", incoming_attack_payload(attack), broadcast=True)


def build_pending_result(attack, attacker, defender, reaction, reaction_label, def_speed, def_limb_key):
    """Tira i dadi e manda il risultato in revisione al Master (nessun HP cambia qui)."""
    try:
        att_speed = int(attack["speed"])
    except (TypeError, ValueError):
        att_speed = 0

    # I dadi vengono tirati qui, ma il risultato resta segreto fino alla pubblicazione del Master.
    att_roll = random.randint(1, 20) + (att_speed // 10)
    def_roll = random.randint(1, 20) + (def_speed // 10)

    result_id = str(uuid.uuid4())
    result = {
        "result_id": result_id,
        "attack_id": attack["attack_id"],
        "attacker_id": attacker.id,
        "attacker_name": attacker.name,
        "defender_id": defender.id,
        "defender_name": defender.name,
        "weapon": attack.get("weapon", "Mani Nude"),
        "reaction_type": reaction,
        "reaction_label": reaction_label,
        "def_limb": def_limb_key,
        "att_speed": att_speed,
        "def_speed": def_speed,
        "att_roll": att_roll,
        "def_roll": def_roll,
        "damage": attack.get("resolved_damage"),
        "damage_formula": attack.get("resolved_damage_formula") or attack.get("damage_formula"),
        "damage_note": attack.get("damage_note"),
        "damage_type": attack.get("damage_type"),
        "distance": attack.get("distance"),
        "range": attack.get("range"),
        "compendium_id": attack.get("compendium_id"),
        "source_slot": attack.get("source_slot"),
        "aim": attack.get("aim"),
        "aim_label": AIM_AREAS[attack["aim"]][0] if attack.get("aim") in AIM_AREAS else None,
        "armor_pieces": armor_pieces(defender),
        "modifiers": detect_attack_situations(attacker, defender, attack.get("aim")),
        "custom_modifiers": saved_custom_modifiers(),
        "armor_slot": default_armor_slot(defender, attack.get("aim"), reaction, def_limb_key)
    }

    pending_combat_results[result_id] = result

    # Una reazione può essere inviata una sola volta.
    pending_attacks.pop(attack["attack_id"], None)

    emit_to_masters("master_pending_combat_result", result)


@socketio.on("resolve_reaction")
@undoable("Reazione")
def handle_resolve_reaction(data):
    data = data or {}
    attack_id = data.get("attack_id")
    attack = pending_attacks.get(attack_id)

    if not attack:
        emit(
            "dice_result",
            {
                "name": "SISTEMA",
                "message": "⚠️ Questo attacco non è più disponibile o è già stato risolto.",
                "is_master_roll": False
            },
            to=request.sid
        )
        return

    attacker = db.session.get(Character, attack["attacker_id"])
    defender = db.session.get(Character, attack["defender_id"])

    if not attacker or not defender:
        pending_attacks.pop(attack_id, None)
        return

    # Reagisce solo chi controlla il difensore
    if not controls_character(defender):
        return

    try:
        att_speed = int(attack["speed"])
    except (TypeError, ValueError):
        return

    weapon_name = attack.get("weapon", "Mani Nude")
    reaction = str(data.get("reaction_type", "Schivata"))
    def_limb_key = str(data.get("def_limb", "bd"))

    if reaction not in {"Schivata", "Parata", "Scambio"}:
        reaction = "Schivata"

    # Dopo uno scambio chi perde si difende normalmente: niente secondo scambio
    if reaction == "Scambio" and attack.get("no_exchange"):
        emit_combat_error("Hai perso lo scambio: ora puoi solo parare o schivare.")
        return

    reaction_action_map = {
        "Parata": "Parare",
        "Schivata": "Schivare"
    }

    # Le voci "Difesa" della tabella indicano con quale meccanica si risolvono
    # (es. "Alzare uno scudo" -> Parata). Velocità e meccanica arrivano
    # dal compendio, mai dal client.
    reaction_rule = None
    reaction_action = str(data.get("reaction_action") or "").strip()

    if reaction_action:
        reaction_rule = get_action_speed_rule(reaction_action)

        if reaction_rule and reaction_rule.get("reaction") in {"Schivata", "Parata"}:
            reaction = reaction_rule["reaction"]
        else:
            reaction_rule = None
            reaction_action = ""

    if not reaction_rule and reaction != "Scambio":
        reaction_rule = get_action_speed_rule(
            reaction_action_map.get(reaction)
        )

    if reaction_rule:
        try:
            def_speed = int(
                reaction_rule.get("speed")
            )
        except (TypeError, ValueError):
            return
    else:
        try:
            def_speed = int(
                data.get("def_speed")
            )
        except (TypeError, ValueError):
            return

    if def_speed <= 0:
        return

    # Scambio: il difensore sceglie con che cosa colpirebbe se vince il tiro
    counter = None
    if reaction == "Scambio":
        counter = build_counter_attack(defender, attacker, data.get("exchange_weapon") or {}, def_speed)
        if isinstance(counter, str):
            emit_combat_error(counter)
            return

    if def_limb_key not in LIMB_KEYS:
        def_limb_key = "bd"

    # Costo della reazione: dalla tabella, oppure 110 - velocità (Scambio)
    try:
        reaction_cost = int(reaction_rule.get("frames")) if reaction_rule else max(0, 110 - def_speed)
    except (TypeError, ValueError):
        reaction_cost = max(0, 110 - def_speed)

    limb_shares = data.get("limb_shares") or {def_limb_key: reaction_cost}
    limb_error = spend_limb_frames(defender.id, limb_shares, reaction_cost)
    if limb_error:
        emit_combat_error(limb_error)
        return

    # L'arto principale (quello che para) deve essere tra quelli usati
    if def_limb_key not in limb_shares:
        def_limb_key = max(limb_shares, key=lambda limb: int(limb_shares[limb] or 0))

    if def_limb_key not in LIMB_KEYS:
        def_limb_key = "bd"

    if counter:
        start_exchange(attack, counter, attacker, defender, def_speed)
        return

    build_pending_result(attack, attacker, defender, reaction, reaction_action or reaction, def_speed, def_limb_key)


# Esiti dello scontro scelti dal Master: (nome in chat, il colpo va a segno?)
COMBAT_OUTCOMES = {
    "colpito": ("Colpito", True),
    "bruciapelo": ("Colpito a bruciapelo", True),
    "parzialmente_parato": ("Colpito ma parzialmente parato", True),
    "parato": ("Parato", False),
    "schivato": ("Schivato", False),
    "mancato": ("Mancato", False),
}


def combat_outcome_sentence(outcome, reaction, defender_name, damage):
    """Frase della chat per l'esito, es. "🩸 Schivata fallita! DiDDi subisce 6 danni"."""
    name = f"<b>{html.escape(defender_name)}</b>"
    takes = f"{name} subisce <b>{damage} {'danno' if damage == 1 else 'danni'}</b>"

    if outcome == "schivato":
        return f"💨 {name} schiva l'attacco!"
    if outcome == "parato":
        return f"🛡️ {name} para l'attacco!"
    if outcome == "mancato":
        return f"💨 L'attacco manca {name}!"
    if outcome == "bruciapelo":
        return f"💥 Colpito a bruciapelo! {takes}"
    if outcome == "parzialmente_parato":
        return f"🛡️ Parata parziale! {takes}"

    # Colpito: la frase dipende dalla reazione tentata
    if reaction == "Nessuna":
        return f"🎯 Colpo a segno! {takes}"
    if reaction == "Schivata":
        return f"🩸 Schivata fallita! {takes}"
    if reaction == "Parata":
        return f"🩸 L'attacco trapassa la guardia! {takes}"
    return f"⚔️ Nessuna difesa! {takes}"


def default_combat_outcome(reaction, att_roll, def_roll):
    """Esito proposto dai tiri; il Master può sempre cambiarlo."""
    try:
        defended = int(def_roll) >= int(att_roll)
    except (TypeError, ValueError):
        defended = False

    if reaction == "Schivata":
        return "schivato" if defended else "colpito"
    if reaction == "Parata":
        return "parato" if defended else "parzialmente_parato"
    if reaction == "Nessuna":
        return "mancato" if defended else "colpito"
    return "colpito"


@socketio.on("master_publish_combat_result")
@undoable("Risultato dello scontro")
def handle_master_publish_combat_result(data):
    data = data or {}

    if request.sid not in master_sids:

        print(
            "[COMBAT] PUBBLICAZIONE RIFIUTATA: "
            "socket non registrato come Master",
            request.sid
        )

        emit(
            "master_combat_error",
            {
                "message":
                    "Il server non riconosce questa sessione come Master."
            },
            to=request.sid
        )

        return

    result_id = data.get("result_id")
    result = pending_combat_results.get(result_id)

    if not result:
        return

    attacker = db.session.get(Character, result["attacker_id"])
    defender = db.session.get(Character, result["defender_id"])

    if not attacker or not defender:
        pending_combat_results.pop(result_id, None)
        return

    # Il danno scritto dal Master è quello finale: sono gli HP che il difensore perde
    try:
        damage = max(0, int(data.get("damage", 0)))
        armor_damage = max(0, int(data.get("armor_damage", 0) or 0))
    except (TypeError, ValueError):
        return

    reaction = result.get("reaction_type", "Schivata")
    outcome = data.get("outcome")
    if outcome not in COMBAT_OUTCOMES:
        outcome = default_combat_outcome(reaction, result.get("att_roll"), result.get("def_roll"))

    label, is_hit = COMBAT_OUTCOMES[outcome]
    if not is_hit:
        damage = 0

    defender.hp_current = max(0, defender.hp_current - damage)

    # Bonus/malus applicati: restano in memoria per la prossima volta
    save_combat_modifiers(data.get("modifiers"))

    # Danno all'armatura, separato dagli HP: va al pezzo scelto dal Master
    armor_hit = None
    armor_slot = data.get("armor_slot")
    piece = next((p for p in armor_pieces(defender) if p["slot"] == armor_slot), None)
    if piece and armor_damage and piece["hp"] > 0:
        taken = min(armor_damage, piece["hp"])
        set_equipment_current_hp(defender, armor_slot, piece["hp"] - taken)
        float_text(defender, f"🛡️ -{taken}", "info")
        armor_hit = {"name": piece["name"], "damage": taken, "hp": piece["hp"] - taken, "max_hp": piece["max_hp"]}

    db.session.commit()
    emit_character_update(defender)

    # Banner del risultato sullo schermo di tutti (solo al Master se il difensore è nascosto)
    banner = {
        "attacker": attacker.name,
        "defender": defender.name,
        "outcome": label,
        "hit": is_hit,
        "damage": damage,
        "aim": AIM_AREAS[result["aim"]][0] if result.get("aim") in AIM_AREAS else None,
        "armor": armor_hit
    }
    if defender.role == "npc" and (defender.is_hidden or defender.is_invisible):
        emit_to_masters("combat_banner", banner)
    else:
        socketio.emit("combat_banner", banner)

    if not is_hit:
        float_text(defender, f"{label}!", "info")

    # In chat: esito e danni, niente tiri di dado
    public_message = (
        "⚔️ <b>RISOLUZIONE SCONTRO</b> ⚔️<br>"
        + combat_outcome_sentence(outcome, reaction, defender.name, damage)
    )
    if armor_hit:
        public_message += (
            f"<br>🛡️ <b>{html.escape(str(armor_hit['name']))}</b>: -{armor_hit['damage']} "
            f"({armor_hit['hp']}/{armor_hit['max_hp']})"
        )

    note = str(data.get("message", "")).strip()
    if note:
        # La nota del Master è testo semplice; i newline diventano <br>
        public_message += "<br><i>" + html.escape(note).replace("\n", "<br>") + "</i>"

    emit(
        "dice_result",
        {
            "name": "SISTEMA",
            "message": public_message,
            "is_master_roll": False
        },
        broadcast=True
    )

    pending_combat_results.pop(result_id, None)


@socketio.on("master_discard_combat_result")
@undoable("Scarto del risultato")
def handle_master_discard_combat_result(data):
    data = data or {}

    if request.sid not in master_sids:
        return

    result_id = data.get("result_id")
    pending_combat_results.pop(result_id, None)
