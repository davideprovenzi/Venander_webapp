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

## Data

- **Database**: SQLite at `instance/venander.db` (Flask-SQLAlchemy resolves `sqlite:///venander.db` into the `instance/` folder). It is created on first run and seeded with three default players ("Giocatore 1-3").
- **Schema changes**: tables are created with `db.create_all()`. Columns added to existing tables need a manual `ALTER TABLE` in the startup block of [app.py](app.py) (see the existing `token_url` and `reward_weapon` migrations), because `create_all()` does not alter existing tables.
- **Reset**: stop the server and delete `instance/venander.db`.
- **Not in git**: the database is the live game state, so `instance/` is git-ignored. Back it up by copying `instance/venander.db` while the server is stopped. If you cloned before it was untracked, copy your `venander.db` somewhere safe *before* pulling, then put it back: the pull removes the tracked copy.
- **Compendium**: [compendio.json](compendio.json) is generated from a spreadsheet (`db_armi.xlsx`, not in the repo). It holds `items`, lookup `indexes` and the `action_speed_table` used to resolve reactions.
- **In-memory state**: active combat, pending attacks and pending combat results live in process memory and are lost on restart.

## Project layout

```
app.py              Flask app: models, startup/migrations, all Socket.IO handlers, combat rules
compendio.json      Item compendium and action speed table
templates/
  index.html        Single-page UI (player sheet, Master dock and panels)
static/
  utils.js          Hex math (pixel <-> hex, corners)
  game.js           Canvas, camera, socket wiring, client state
  renderer.js       Board, token and drawing rendering
  ui.js             Sheets, shop, combat, forge and sidequest panels
  control.js        Keyboard and mouse input, tool handling
  style.css         Styles
instance/
  venander.db       SQLite database
```

## Architecture notes

- Almost everything happens over Socket.IO; the only HTTP route is `/`. On connect the server sends combat state, drawings, the compendium and the map, then the client sends `register_session_role` and gets the role-appropriate character data.
- Master-only events are sent to the sockets in `master_sids`; sidequest events go only to the players they target.
- Socket.IO runs in `threading` mode with a 50 MB message limit so maps and token images can be sent as data URLs.
- The dev server starts with `debug=True` and the reloader off.
