"""Venander: tavolo virtuale per il gioco di ruolo Venander.

Importare il pacchetto prepara il database e registra tutti gli eventi
Socket.IO (ogni modulo li dichiara con @socketio.on). Il server si avvia
da app.py nella cartella del progetto.
"""
from venander import (  # noqa: F401  (importati per registrare gli eventi)
    core,
    models,
    state,
    serialization,
    images,
    database,
    sounds,
    tokens,
    combat,
    movement,
    permissions,
    threats,
    undo,
    utils,
    forge,
    sidequests,
    session,
    turns,
    npcs,
    characters,
    ammo,
    gadgets,
    stats,
    compendium,
    hexes,
    equipment,
    chat,
    drawing,
    terrain,
    map_tools,
    rest,
    scenes,
    wiki,
    undo_handler,
    trinkets,
    loot,
    armor_repair,
    attacks,
    exchange,
    aiming,
    https_cert,
)
from venander.core import app, socketio  # noqa: F401
from venander.https_cert import ensure_https_cert  # noqa: F401
