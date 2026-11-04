"""Ambiente di prova di Venander.

Avvia una seconda copia del gioco, separata dalla partita vera:
  - usa instance/venander_test.db, copiato dal database vero a ogni avvio
    (con --keep si riusa la copia precedente);
  - gira sulla porta 5001 (la partita vera resta sulla 5000);
  - mostra in alto la scritta "AMBIENTE DI PROVA".

Combattimento, annulla e minacce vivono nella memoria del processo, quindi
anche quelli restano separati dalla partita vera.

Si ricarica da solo quando cambia il codice (app.py): basta aggiornare la
pagina del browser. Il ricaricamento non ricopia il database di prova, ma
azzera combattimento, annulla e minacce in corso.

Uso:
    python test_env.py            # copia fresca della partita vera
    python test_env.py --keep     # riprende la copia di prova precedente
    python test_env.py --port 5001
    python test_env.py --https --host mio.indirizzo.pubblico   # https, per il microfono da fuori
"""
import argparse
import os
import socket
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LIVE_DB = ROOT / "instance" / "venander.db"
TEST_DB = ROOT / "instance" / "venander_test.db"


def copy_live_database():
    """Copia sicura anche con la partita vera in corso (backup di SQLite, non cp)."""
    source = sqlite3.connect(f"file:{LIVE_DB}?mode=ro", uri=True)
    target = sqlite3.connect(TEST_DB)
    with target:
        source.backup(target)
    source.close()
    target.close()


def port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        return probe.connect_ex(("127.0.0.1", port)) == 0


def main():
    parser = argparse.ArgumentParser(description="Avvia l'ambiente di prova di Venander.")
    parser.add_argument("--keep", action="store_true", help="riusa la copia di prova esistente")
    parser.add_argument("--port", type=int, default=5001, help="porta dell'ambiente di prova (default 5001)")
    parser.add_argument("--https", action="store_true", help="usa https (microfono per chi si collega da fuori)")
    parser.add_argument("--host", action="append", default=[], metavar="INDIRIZZO",
                        help="indirizzo pubblico o nome con cui gli altri si collegano (ripetibile)")
    args = parser.parse_args()

    if args.port == 5000:
        parser.error("la porta 5000 è quella della partita vera: scegline un'altra")

    # Il ricaricatore riesegue questo file a ogni modifica del codice: la copia
    # si fa solo al primo avvio, non nei riavvii automatici
    is_reload = os.environ.get("WERKZEUG_RUN_MAIN") == "true"

    # Prima di toccare il database: se c'è già un ambiente di prova acceso
    # non bisogna sovrascrivergli la copia sotto i piedi
    if not is_reload and port_in_use(args.port):
        parser.error(
            f"la porta {args.port} è già occupata: probabilmente l'ambiente di prova è già acceso. "
            "Chiudilo prima (Ctrl+C nel suo terminale) oppure usa --port con un'altra porta."
        )

    if is_reload:
        pass
    elif args.keep and TEST_DB.exists():
        print(f"🧪 Riprendo la copia di prova: {TEST_DB.name}")
    elif LIVE_DB.exists():
        copy_live_database()
        print(f"🧪 Copia fresca della partita vera in {TEST_DB.name}")
    else:
        print("🧪 Nessuna partita vera trovata: parto da un database nuovo")

    # Vanno impostate prima di importare app.py, che le legge all'avvio
    os.environ["VENANDER_DB"] = TEST_DB.name
    os.environ["VENANDER_TEST_MODE"] = "1"

    import app as game

    ssl_context = game.ensure_https_cert(args.host) if args.https else None
    if not is_reload:
        scheme = "https" if ssl_context else "http"
        print(f"🧪 Ambiente di prova su {scheme}://localhost:{args.port} (si ricarica da solo quando cambia il codice)")

    game.socketio.run(
        game.app,
        host="0.0.0.0",
        port=args.port,
        debug=True,
        use_reloader=True,
        use_debugger=False,
        ssl_context=ssl_context
    )


if __name__ == "__main__":
    main()
