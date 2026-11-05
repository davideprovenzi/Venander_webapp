# Venander

A real-time virtual tabletop for running the Venander tabletop RPG in the browser. One person plays the **Master**, the others pick their **player** character, and everyone shares a hex-grid board kept in sync over WebSockets.

The UI and game content are in Italian.

## Features

- **Hex board**: pointy-topped hex grid (odd-r offset) with pan/zoom, a custom background map (scale and offset), character and NPC tokens.
- **Fog of War**: global toggle, per-hex reveal, reset.
- **Drawing tools**: lines, circles, squares, triangles, image stickers, laser pointer and location pings, all persisted and broadcast.
- **Character sheets**: HP, stamina, concentration, stats, weapons, skills, backpack, bonuses, notes, XP and a per-character skill shop.
- **Combat**: turn order, action points (PA), per-limb equipment HP, attack declaration with distance/range checks, reactions resolved by action speed, and Master review before results are published.
- **Compendium**: weapons, armour, gadgets and licences loaded from [compendio.json](compendio.json).
- **Master tools**: spawn NPCs (with a reusable token library), hide or make characters invisible, the **Master Forge** for designing custom weapons, and **sidequests** players can pay for, with optional forged-weapon rewards.
- **Dice and chat** shared by everyone at the table.

## Quick start

Requires Python 3.10+ (developed on 3.12).

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open <http://localhost:5000>. The server listens on `0.0.0.0:5000`, so other people on the same network can join at `http://<your-ip>:5000`.

### Playing

Use the **"Chi sei?"** selector at the top of the page:

- **👑 Master** sees full data for every character, the Master dock (entities, map, FoW, drawing, selection, sidequests, forge, combat) and pending combat results.
- **A player character** sees their own sheet and only the public data of others.

There is no authentication; the selector is trust-based. Do not expose the server to the public internet.

### HTTPS (microphone for remote players)

Browsers only allow the microphone (recording NPC sounds) on `localhost` or over `https`. Anyone connecting through a forwarded port over plain `http` cannot record. Start the server with HTTPS instead:

```bash
python app.py --https --host <address the others use>    # e.g. your public IP or DNS name
python test_env.py --https --host <address the others use>
```

The first start creates a self-signed certificate in `instance/certs/` (git-ignored: it holds the private key). It is recreated only if the `--host` list changes. Everyone then connects with `https://<address>:<port>`. The first time, each browser shows a "not secure / self-signed" warning that has to be accepted once; after that the page works normally, microphone included. Plain `http://` links stop working while HTTPS is on.

### Test environment

To try changes without touching the real session, run a second copy of the game next to it:

```bash
python test_env.py          # fresh copy of the real game, on http://localhost:5001
python test_env.py --keep   # reuse the previous test copy instead
```

It uses `instance/venander_test.db`, a copy of the real database taken at every start (safe even while the real game is running), and shows a red "AMBIENTE DI PROVA" banner. Combat, undo and threats live in each server's memory, so the two never mix. The real game keeps running on port 5000 with `python app.py`.

## Data

- **Database**: SQLite at `instance/venander.db` (Flask-SQLAlchemy resolves `sqlite:///venander.db` into the `instance/` folder). It is created on first run and seeded with three default players ("Giocatore 1-3").
- **Schema changes**: tables are created with `db.create_all()`. Columns added to existing tables need a manual `ALTER TABLE` in [venander/database.py](venander/database.py) (see the existing `token_url` and `reward_weapon` migrations), because `create_all()` does not alter existing tables.
- **Reset**: stop the server and delete `instance/venander.db`.
- **Images**: tokens, photos, maps, stickers and item pictures are stored as files in `instance/images/`, named by the SHA-256 of their content; the database keeps only `/images/<file>`. Uploads still arrive as data URLs: a SQLAlchemy `before_flush` hook ([venander/images.py](venander/images.py), [venander/image_store.py](venander/image_store.py)) writes them to disk before they reach the database. Older databases are converted at startup (a copy goes to `instance/backups/` first). SVGs stay inline.
- **In git**: `instance/venander.db` and `instance/images/` are tracked so the game state moves between machines with a pull (the server warns if the database file is replaced while it runs). `instance/backups/`, `instance/venander_test.db` and `instance/certs/` are not.
- **Compendium**: [compendio.json](compendio.json) is generated from a spreadsheet (`db_armi.xlsx`, not in the repo). It holds `items`, lookup `indexes` and the `action_speed_table` used to resolve reactions.
- **In-memory state**: active combat, pending attacks and pending combat results live in process memory and are lost on restart.

## Project layout

```
app.py                Entry point: python app.py [--https --host ...]
venander/             Server package, one module per topic
  core.py             Flask app, Socket.IO, database, code fingerprints, cache headers
  models.py           SQLAlchemy models
  database.py         create_all, lightweight migrations, seeding
  state.py            In-memory state (combat, pending attacks, sessions)
  serialization.py    Character payloads per role, update broadcasts
  images.py           Images as files (+ image_store.py helpers)
  permissions.py      Who may act for which character
  undo.py             Snapshots and the @undoable decorator (undo_handler.py: the button)
  session.py          Connect, roles, player registration
  combat.py, turns.py Limb frames and turns; start/stop combat, next turn, table actions
  attacks.py          Declare attack, reactions, Master review
  equipment.py        Attacking weapon, damage, armor durability
  aiming.py, exchange.py, threats.py, ammo.py, terrain.py, trinkets.py, loot.py, ...
  characters.py, stats.py   Sheet, vitals, PA rules
  compendium.py, forge.py, sidequests.py, npcs.py, scenes.py, wiki.py, chat.py, ...
compendio.json        Item compendium and action speed table
templates/
  index.html          Single-page UI; scripts load in the order listed at the bottom
static/
  utils.js            Hex math (pixel <-> hex, corners)
  game/               Client core: socket, state, camera, server updates, Master entity panel, map, NPC library
  renderer.js         Board, token and drawing rendering
  ui/                 Panels: sheet, chat, forge, sidequests, compendium, doll, equipment, attack/defense, ammo/aim...
  control.js          Keyboard and mouse input, tool handling
  style.css           Styles
instance/
  venander.db         SQLite database
  images/             Uploaded images (content-addressed)
  sounds/             NPC sounds
```

The scripts in `static/game/` and `static/ui/` are classic scripts sharing one global scope: keep the order in `index.html` when adding files.

## Architecture notes

- Almost everything happens over Socket.IO; each `venander/` module registers its own `@socketio.on` handlers when the package is imported; the HTTP routes are `/`, `/static/`, `/images/` and `/sounds/`. On connect the server sends combat state, drawings, the compendium and the map, then the client sends `register_session_role` and gets the role-appropriate character data.
- Master-only events are sent to the sockets in `master_sids`; sidequest events go only to the players they target.
- Socket.IO runs in `threading` mode with a 50 MB message limit so uploads (maps, tokens) can be sent as data URLs.
- **Caching** (for players on a forwarded port): scripts and styles are linked as `/static/<file>?v=<fingerprint>` and served with a one-year `immutable` cache, so a reload downloads only the page; images are cached the same way because their names never change. The page itself is `no-cache`. Responses are compressed with Flask-Compress.
- The dev server starts with `debug=True` and the reloader off.
