"""HTTPS (opzionale).

Il microfono (registrare i suoni degli NPC) il browser lo concede solo su
localhost o su https. Chi si collega dalla porta inoltrata usa http, quindi
con --https il server usa un certificato fatto in casa: la prima volta ogni
browser mostra un avviso ("non sicuro") da accettare, poi funziona tutto.
Certificato e chiave stanno in instance/certs (fuori da git).
"""
import os
from venander.core import app


CERT_DIR = os.path.join(app.instance_path, "certs")


def ensure_https_cert(extra_hosts=()):
    """Crea (una volta sola) il certificato autofirmato; lo rifà se cambiano gli indirizzi."""
    import ipaddress
    import subprocess

    cert_path = os.path.join(CERT_DIR, "cert.pem")
    key_path = os.path.join(CERT_DIR, "key.pem")
    hosts_path = os.path.join(CERT_DIR, "hosts.txt")

    hosts = ["localhost", "127.0.0.1", *[h.strip() for h in extra_hosts if h and h.strip()]]
    hosts = list(dict.fromkeys(hosts))
    wanted = "\n".join(hosts)

    current = open(hosts_path).read() if os.path.exists(hosts_path) else None
    if os.path.exists(cert_path) and os.path.exists(key_path) and current == wanted:
        return cert_path, key_path

    def san(host):
        try:
            ipaddress.ip_address(host)
            return f"IP:{host}"
        except ValueError:
            return f"DNS:{host}"

    os.makedirs(CERT_DIR, exist_ok=True)
    subprocess.run([
        "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256",
        "-days", "825", "-subj", "/CN=Venander",
        "-keyout", key_path, "-out", cert_path,
        "-addext", "subjectAltName=" + ",".join(san(h) for h in hosts),
    ], check=True, capture_output=True)
    os.chmod(key_path, 0o600)
    with open(hosts_path, "w") as handle:
        handle.write(wanted)
    print(f"🔐 Nuovo certificato per: {', '.join(hosts)}")
    return cert_path, key_path
