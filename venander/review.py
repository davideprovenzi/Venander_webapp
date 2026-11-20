"""Revisione del Master: ogni attacco che arriva a segno (o quasi) passa da qui.

I dadi si tirano sul server, il risultato resta segreto finché il Master non lo
pubblica. Qui si prepara il risultato da rivedere e si ricordano i bonus/malus
decisi per le situazioni (copertura, altura, bersaglio in movimento...).
"""
import random
import re
import uuid
from venander.core import db
from venander.equipment import AIM_AREAS, armor_pieces, default_armor_slot
from venander.hexes import hex_key, hex_line
from venander.models import CombatModifier, WorldState
from venander.serialization import emit_to_masters
from venander.state import pending_attacks, pending_combat_results
from venander.terrain import has_line_of_sight, sight_blocking_hexes
from venander.stats import character_stat


# Etichetta del colpo sparato senza mirare (vedi build_pending_result)
UNAIMED_SHOT_LABEL = "Senza mira (fortuna)"


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


def build_pending_result(attack, attacker, defender, reaction, reaction_label, def_speed, def_limb_key, sure_hit=False):
    """Tira i dadi e manda il risultato in revisione al Master (nessun HP cambia qui).

    sure_hit: il colpo va a segno per regola (es. scambio d'attacco vinto):
    niente tiro di difesa, l'esito proposto è "Colpito".
    """
    try:
        att_speed = int(attack["speed"])
    except (TypeError, ValueError):
        att_speed = 0

    # I dadi vengono tirati qui, ma il risultato resta segreto fino alla pubblicazione del Master.
    luck_roll = None
    if attack.get("unaimed"):
        # Colpo senza mira: conta solo la fortuna (d20 + Virtù), niente tiro di difesa.
        # L'esito non viene proposto: lo sceglie il Master.
        virtu = int(character_stat(attacker, "Virtù"))
        d20 = random.randint(1, 20)
        luck_roll = {"d20": d20, "virtu": virtu, "total": d20 + virtu}
        att_roll, def_roll = d20 + virtu, 0
    else:
        att_roll = random.randint(1, 20) + (att_speed // 10)
        def_roll = 0 if sure_hit else random.randint(1, 20) + (def_speed // 10)

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
        "armor_slot": default_armor_slot(defender, attack.get("aim"), reaction, def_limb_key),
        "unaimed": bool(luck_roll),
        "luck_roll": luck_roll
    }

    pending_combat_results[result_id] = result

    # Una reazione può essere inviata una sola volta.
    pending_attacks.pop(attack["attack_id"], None)

    emit_to_masters("master_pending_combat_result", result)
