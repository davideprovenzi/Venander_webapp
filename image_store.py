"""Immagini salvate come file invece che dentro il database.

Le immagini caricate dal browser arrivano come data URL (base64). Tenerle nel
database vuol dire spedirle a tutti a ogni aggiornamento e a ogni ricarica
della pagina. Qui ogni immagine diventa un file in instance/images, chiamato
con l'impronta del suo contenuto, e nel database resta solo "/images/<file>".

Il nome dipende dal contenuto, quindi un file non cambia mai: il browser lo
può tenere in cache per sempre e la stessa immagine usata due volte (pedina
di un NPC e del suo modello) occupa un solo file.
"""
import base64
import hashlib
import os
import re
import uuid

IMAGE_URL_PREFIX = "/images/"

# Gli SVG restano data URL: serviti dal nostro indirizzo potrebbero eseguire script
IMAGE_EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/avif": "avif",
}
IMAGE_FILE_PATTERN = re.compile(r"^[0-9a-f]{64}\.(png|jpg|gif|webp|bmp|avif)$")
DATA_URL_PATTERN = re.compile(r"^data:(image/[a-z0-9.+-]+);base64,", re.IGNORECASE)


def store_image(value, folder):
    """Data URL di un'immagine -> "/images/<impronta>.<ext>". Tutto il resto torna com'è."""
    if not isinstance(value, str) or not value.startswith("data:"):
        return value
    match = DATA_URL_PATTERN.match(value)
    if not match:
        return value
    extension = IMAGE_EXTENSIONS.get(match.group(1).lower())
    if not extension:
        return value
    try:
        raw = base64.b64decode(value[match.end():], validate=False)
    except (ValueError, TypeError):
        return value
    if not raw:
        return value

    name = f"{hashlib.sha256(raw).hexdigest()}.{extension}"
    path = os.path.join(folder, name)
    if not os.path.exists(path):
        os.makedirs(folder, exist_ok=True)
        # Scrittura in un file temporaneo e poi rinomina: nessuno vede mai un file a metà
        temporary = f"{path}.{uuid.uuid4().hex}.tmp"
        with open(temporary, "wb") as handle:
            handle.write(raw)
        os.replace(temporary, path)
    return IMAGE_URL_PREFIX + name


def store_images_in_json(value, folder):
    """Converte ogni data URL di immagine dentro liste e dizionari (es. "img" degli oggetti)."""
    if isinstance(value, str):
        return store_image(value, folder)
    if isinstance(value, list):
        return [store_images_in_json(item, folder) for item in value]
    if isinstance(value, dict):
        return {key: store_images_in_json(item, folder) for key, item in value.items()}
    return value
