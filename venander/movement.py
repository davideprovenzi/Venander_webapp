"""Registrazione dei giocatori sulla mappa e movimento delle pedine.
"""
import html
from flask_socketio import emit
from venander.aiming import break_aims, check_aims
from venander.combat import DEFAULT_MOVE_FRAMES, is_players_turn
from venander.core import db, movement_lock, socketio
from venander.hexes import hex_distance, hex_key, hex_line
from venander.models import Character, WorldState
from venander.permissions import controls_character, is_master_request
from venander.serialization import emit_character_update
from venander.state import combat_state, combat_threats
from venander.stats import stat_pa_current
from venander.terrain import (
    BARRICADE_PA_COST,
    SURFACE_EFFECTS,
    movement_frame_cost,
    prompt_surface_effect,
    wall_hexes,
)
from venander.threats import find_threat_stop, start_threat_interrupts
from venander.undo import undoable


# Raggio visivo dei giocatori con la nebbia di guerra (come VISION_RADIUS in static/game/core.js)
VISION_RADIUS = 3

# Frame per passo: devono coincidere con i pulsanti del popup movimento
MOVE_FRAME_COSTS = {"Camminata": 20, "Corsa": 15, "Furtivo": 25}


@socketio.on("declare_move")
@undoable("Movimento")
def handle_move(data):
    try:
        char_id = int(data.get("char_id"))
        target_x = int(data.get("target_x"))
        target_y = int(data.get("target_y"))
    except (TypeError, ValueError):
        return

    move_id = data.get("move_id")
    mode = data.get("mode")

    with movement_lock:
        char = db.session.get(Character, char_id)
        if not char or char.role == "master" or not controls_character(char):
            return

        def reject(reason):
            emit("move_rejected", {
                "char_id": char_id,
                "move_id": move_id,
                "reason": reason,
                "current_x": char.pos_x,
                "current_y": char.pos_y
            })

        occupied = Character.query.filter(
            Character.pos_x == target_x,
            Character.pos_y == target_y,
            Character.id != char_id
        ).first()

        if occupied:
            reject("occupied")
            return

        # I muri non si attraversano (il Master può comunque riposizionare
        # le pedine liberamente, senza andatura)
        ws = WorldState.query.first()
        if mode or not is_master_request():
            full_path = hex_line(char.pos_x, char.pos_y, target_x, target_y)
            if any(hex_key(hx, hy) in wall_hexes(ws) for hx, hy in full_path[1:]):
                reject("wall")
                return

        # Entrando in un'area minacciata da un nemico ci si ferma lì
        triggered_threats = []
        in_combat_now = combat_state.get("is_active") and combat_state.get("turn_order")
        if in_combat_now and combat_threats:
            path = hex_line(char.pos_x, char.pos_y, target_x, target_y)
            stop_index, triggered_threats = find_threat_stop(char, path)

            if stop_index is not None:
                # Se l'esagono è occupato si ferma sull'ultimo libero prima
                for index in range(stop_index, 0, -1):
                    hx, hy = path[index]
                    if not Character.query.filter(
                        Character.pos_x == hx, Character.pos_y == hy, Character.id != char_id
                    ).first():
                        target_x, target_y = hx, hy
                        break
                else:
                    target_x, target_y = char.pos_x, char.pos_y

        # Mezza barricata (copertura parziale): in combattimento un giocatore la scavalca
        # spendendo 5 PA di una statistica a sua scelta, altrimenti non passa
        barricade_cost = None
        if (
            combat_state.get("is_active") and char.role == "player"
            and (mode or not is_master_request())
        ):
            path_now = hex_line(char.pos_x, char.pos_y, target_x, target_y)
            barricades = sum(
                1 for hx, hy in path_now[1:]
                if (ws.terrain or {}).get(hex_key(hx, hy)) == "copertura_parziale"
            )
            if barricades:
                stat = data.get("pa_stat")
                if stat not in (char.stats or {}) or isinstance((char.stats or {}).get(stat), dict):
                    reject("barricade_stat")
                    return
                needed = BARRICADE_PA_COST * barricades
                if stat_pa_current(char, stat) < needed:
                    reject("barricade_pa")
                    return
                barricade_cost = (stat, needed)

        # In combattimento il movimento costa frame, calcolati qui e non dal client.
        # Il Master può comunque riposizionare liberamente (senza andatura).
        move_cost = None
        in_combat = combat_state.get("is_active") and any(
            int(entry.get("id", -1)) == char.id for entry in combat_state.get("turn_order", [])
        )

        if in_combat:
            if not is_players_turn(char):
                reject("not_your_turn")
                return

            if mode in MOVE_FRAME_COSTS:
                steps = hex_distance(char.pos_x, char.pos_y, target_x, target_y)
                move_cost = movement_frame_cost(
                    ws, hex_line(char.pos_x, char.pos_y, target_x, target_y), MOVE_FRAME_COSTS[mode]
                )
                frames = int(combat_state["players_pa"].get(str(char.id), DEFAULT_MOVE_FRAMES))

                if move_cost > frames:
                    reject("frames")
                    return
            elif not is_master_request():
                reject("frames")
                return

        walked_path = hex_line(char.pos_x, char.pos_y, target_x, target_y)

        if barricade_cost:
            stat, needed = barricade_cost
            pa_stats = dict(char.pa_stats or {})
            pa_stats[stat] = stat_pa_current(char, stat) - needed
            char.pa_stats = pa_stats

        char.pos_x = target_x
        char.pos_y = target_y
        db.session.commit()

        if move_cost is not None:
            combat_state["players_pa"][str(char.id)] = frames - move_cost

        # Superfici attraversate: il Master decide se applicarne l'effetto
        entered_surfaces = []
        for hx, hy in walked_path[1:]:
            surface = (ws.surfaces or {}).get(hex_key(hx, hy))
            if surface in SURFACE_EFFECTS and SURFACE_EFFECTS[surface]["effect"] and surface not in entered_surfaces:
                entered_surfaces.append(surface)

    # Il movimento può essere stato accorciato da una minaccia
    emit_character_update(char, {"_move_id": move_id, "_stopped_by_threat": bool(triggered_threats)})

    if move_cost is not None:
        socketio.emit("sync_pa", {"char_id": char.id, "pa": frames - move_cost})
        socketio.emit("dice_result", {
            "name": char.name,
            "message": (
                f"si sposta di <b>{steps} passi</b> ({html.escape(mode)}) "
                f"consumando <b>{move_cost} Frame</b> movimento."
            ),
            "is_master_roll": False
        })

    # Chi si muove perde la mira; e chi si sposta può uscire dalla vista di altri
    if (char.pos_x, char.pos_y) != (walked_path[0][0], walked_path[0][1]):
        break_aims(lambda aim: aim["shooter_id"] == char.id, "si è mosso")
    check_aims()

    if triggered_threats:
        start_threat_interrupts(char, triggered_threats)

    if barricade_cost:
        socketio.emit("dice_result", {
            "name": char.name,
            "message": f"🧱 scavalca la barricata spendendo <b>{barricade_cost[1]} PA</b> di {html.escape(barricade_cost[0])}.",
            "is_master_roll": False
        })

    for surface in entered_surfaces:
        prompt_surface_effect(char, surface, "enter")
