"""Avvio della partita di Venander.

    python app.py                       # http://localhost:5000
    python app.py --https --host <ip>   # https, per il microfono da fuori

Il codice del server sta nel pacchetto venander/ (un modulo per argomento).
"""
from venander import app, ensure_https_cert, socketio


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Avvia la partita di Venander.")
    parser.add_argument("--https", action="store_true",
                        help="usa https (serve a chi si collega da fuori per registrare con il microfono)")
    parser.add_argument("--host", action="append", default=[], metavar="INDIRIZZO",
                        help="indirizzo pubblico o nome con cui gli altri si collegano (ripetibile)")
    parser.add_argument("--port", type=int, default=5000)
    args = parser.parse_args()

    ssl_context = ensure_https_cert(args.host) if args.https else None
    if ssl_context:
        print(f"🔐 Partita su https://localhost:{args.port} (la prima volta il browser chiede di accettare il certificato)")

    socketio.run(
        app,
        host="0.0.0.0",
        port=args.port,
        debug=True,
        use_reloader=False,
        # Il debugger interattivo stampa un traceback ogni volta che un
        # browser chiude la connessione (ricarica, scheda chiusa...): rumore.
        # Gli errori veri vengono comunque stampati.
        use_debugger=False,
        ssl_context=ssl_context
    )
