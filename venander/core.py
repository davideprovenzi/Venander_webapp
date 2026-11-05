"""Applicazione Flask, Socket.IO e database, più la versione del codice.

Il server legge il codice una volta sola all'avvio, mentre le pagine (static,
templates) arrivano sempre dal disco: se il codice cambia e il server non
viene riavviato, la pagina mostra pulsanti nuovi che il server ignora.
L'impronta dei file all'avvio e quella attuale lo rivelano.

Qui stanno anche le regole di cache del browser: script e stili con ?v=<impronta>
si tengono un anno, la pagina va sempre richiesta.
"""
import os
from flask import Flask, request
from flask_socketio import SocketIO
from flask_sqlalchemy import SQLAlchemy
from threading import Lock


ONE_YEAR = 365 * 24 * 3600


class VenanderFlask(Flask):
    def get_send_file_max_age(self, filename):
        # Con ?v=<impronta> l'indirizzo cambia a ogni modifica del file:
        # il browser può tenerlo in cache senza più chiedere al server
        if request.args.get("v"):
            return ONE_YEAR
        return super().get_send_file_max_age(filename)


# Il pacchetto sta in venander/, ma pagine, script e database sono nella
# cartella del progetto: static/, templates/, instance/
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

app = VenanderFlask(
    "venander",
    root_path=PROJECT_ROOT,
    instance_path=os.path.join(PROJECT_ROOT, "instance"),
)

app.config["SECRET_KEY"] = "chiave_segreta_venander"

# L'ambiente di prova (test_env.py) usa una copia del database: venander_test.db
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{os.environ.get('VENANDER_DB', 'venander.db')}"

app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

TEST_MODE = os.environ.get("VENANDER_TEST_MODE") == "1"

CODE_ROOT = PROJECT_ROOT


def files_fingerprint(paths):
    """Impronta di un gruppo di file (date e dimensioni: basta e costa poco)."""
    import hashlib
    parts = []
    for path in sorted(paths):
        try:
            info = os.stat(path)
        except OSError:
            continue
        parts.append(f"{os.path.relpath(path, CODE_ROOT)}:{info.st_mtime_ns}:{info.st_size}")
    return hashlib.sha1("\n".join(parts).encode()).hexdigest()[:12]


def server_fingerprint():
    # Il codice che il server carica all'avvio: se cambia serve un riavvio
    package = os.path.join(CODE_ROOT, "venander")
    paths = [os.path.join(CODE_ROOT, "app.py")]
    paths.extend(os.path.join(package, name) for name in os.listdir(package) if name.endswith(".py"))
    return files_fingerprint(paths)


def page_fingerprint():
    # Quello che il browser scarica: se cambia basta ricaricare la pagina
    paths = []
    for folder in ("static", "templates"):
        for base, _dirs, files in os.walk(os.path.join(CODE_ROOT, folder)):
            paths.extend(os.path.join(base, name) for name in files)
    return files_fingerprint(paths)


STARTUP_SERVER_FINGERPRINT = server_fingerprint()

# Il file del database sostituito mentre il server gira (es. git pull o checkout
# di un commit che contiene instance/venander.db): il server continuerebbe a
# scrivere nella copia vecchia, ormai cancellata, e tutto andrebbe perso al riavvio.
DB_FILE = os.path.join(app.instance_path, os.environ.get("VENANDER_DB", "venander.db"))


def db_file_identity():
    try:
        info = os.stat(DB_FILE)
        return (info.st_dev, info.st_ino)
    except OSError:
        return None


STARTUP_DB_IDENTITY = None   # si legge dopo la creazione del database (vedi database.py)


def code_status():
    return {
        "server_outdated": server_fingerprint() != STARTUP_SERVER_FINGERPRINT,
        "db_replaced": STARTUP_DB_IDENTITY is not None and db_file_identity() != STARTUP_DB_IDENTITY,
        "page": page_fingerprint()
    }


def asset_url(filename):
    """/static/<file>?v=<impronta>: cambia solo quando cambia il file."""
    version = files_fingerprint([os.path.join(app.static_folder, filename)])
    return f"/static/{filename}?v={version}"


@app.context_processor
def inject_test_mode():
    return {"test_mode": TEST_MODE, "code_fingerprint": page_fingerprint(), "asset": asset_url}


@app.after_request
def set_cache_headers(response):
    # La pagina va sempre richiesta (contiene le versioni dei file);
    # file versionati e immagini non cambiano mai: niente controlli
    if request.path == "/":
        response.cache_control.no_cache = True
    elif request.path.startswith("/images/") or (request.path.startswith("/static/") and request.args.get("v")):
        response.cache_control.immutable = True
    return response


# Pagina, script e stili compressi (gzip/brotli): pesano un quinto
try:
    from flask_compress import Compress
    Compress(app)
except ImportError:
    print("⚠️ Flask-Compress non installato: pip install -r requirements.txt per una pagina più leggera.")

db = SQLAlchemy(app)

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    max_http_buffer_size=50000000,
    async_mode="threading"
)

# Serializza i cambi di posizione: evita che due richieste concorrenti
# occupino lo stesso esagono nello stesso istante.
movement_lock = Lock()
