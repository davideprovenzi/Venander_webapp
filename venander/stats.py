"""Caratteristiche e PA.

I PA massimi di una caratteristica sono il suo valore x 10. Si ricaricano
pagando la risorsa della caratteristica (stamina, concentrazione o salute).
"""



# PA massimi di una caratteristica: valore x 10 (Forza 2 -> 20 PA).
# Deve coincidere con PA_PER_STAT_POINT in static/ui/actions.js.
PA_PER_STAT_POINT = 10


def stat_pa_max(char, stat):
    try:
        stat_val = int((char.stats or {}).get(stat, 1))
    except (TypeError, ValueError):
        stat_val = 1
    return max(0, stat_val) * PA_PER_STAT_POINT


def stat_pa_current(char, stat):
    pa_stats = char.pa_stats or {}
    if stat in pa_stats:
        return int(pa_stats[stat])
    return stat_pa_max(char, stat)


# Ricarica dei PA: ogni caratteristica si paga con la sua risorsa.
# Deve coincidere con PA_RESET_COSTS in static/ui/actions.js.
PA_RESET_COSTS = {
    "Forza": ("stamina", 5),
    "Destrezza": ("stamina", 5),
    "Percezione": ("conc", 5),
    "Volontà": ("conc", 5),
    "Arguzia": ("conc", 5),
    "Spirito": ("conc", 5),
    "Virtù": ("hp", 5),
}

# Risorsa -> (colonna del personaggio, nome mostrato in chat)
PA_RESET_POOLS = {
    "stamina": ("stamina_current", "Stamina ⚡"),
    "conc": ("conc_current", "Concentrazione 🧠"),
    "hp": ("hp_current", "Salute ❤️"),
}


def character_stat(character, stat_name):
    stats = character.stats or {}
    wanted = str(stat_name).strip().casefold()

    for key, value in stats.items():
        if str(key).strip().casefold() == wanted:
            try:
                return float(value)
            except (TypeError, ValueError):
                return 0.0

    return 0.0
