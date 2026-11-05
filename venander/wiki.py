"""Wiki del mondo.

Scrive solo il Master; i giocatori leggono le pagine non segrete.
"""
from flask import request
from venander.core import db, socketio
from venander.models import Character, WikiPage
from venander.permissions import is_master_request
from venander.state import client_character_ids, client_roles, master_sids


WIKI_MAX_CONTENT = 100_000

WIKI_MAX_IMAGE = 5_000_000


def emit_wiki_list_to_sid(sid, role):
    char_id = client_character_ids.get(sid)
    pages = WikiPage.query.order_by(WikiPage.category, WikiPage.title).all()
    visible = [page.payload_for(role, char_id) for page in pages if page.is_visible_to(role, char_id)]
    socketio.emit("wiki_list", visible, to=sid)


def broadcast_wiki_page(page):
    """Il Master riceve sempre la pagina; i giocatori solo se possono vederla."""
    for sid, role in list(client_roles.items()):
        char_id = client_character_ids.get(sid)
        if page.is_visible_to(role, char_id):
            socketio.emit("wiki_page_saved", page.payload_for(role, char_id), to=sid)
        else:
            # Pagina appena nascosta: i giocatori la tolgono dal loro wiki
            socketio.emit("wiki_page_removed", {"id": page.id}, to=sid)


def clean_wiki_image(value):
    image = str(value or "").strip()

    if not image or len(image) > WIKI_MAX_IMAGE:
        return None

    if image.startswith("data:image/") or image.startswith(("http://", "https://", "/static/", "/images/")):
        return image

    return None


@socketio.on("wiki_save_page")
def handle_wiki_save_page(data):
    if request.sid not in master_sids:
        return

    data = data or {}
    title = str(data.get("title", "")).strip()[:160]

    if not title:
        return

    page = db.session.get(WikiPage, data.get("id")) if data.get("id") else None

    if page is None:
        page = WikiPage()
        db.session.add(page)

    page.title = title
    page.category = str(data.get("category", "")).strip()[:60] or "Generale"
    page.content = str(data.get("content", ""))[:WIKI_MAX_CONTENT]
    page.image = clean_wiki_image(data.get("image"))
    page.hidden = bool(data.get("hidden", False))

    db.session.commit()
    broadcast_wiki_page(page)


@socketio.on("wiki_share_page")
def handle_wiki_share_page(data):
    """Consegna una pagina (handout) a personaggi scelti, anche se è segreta."""
    if not is_master_request():
        return

    data = data or {}
    page = db.session.get(WikiPage, data.get("id"))
    if not page:
        return

    char_ids = []
    for raw_id in data.get("char_ids", []):
        char = db.session.get(Character, raw_id)
        if char and char.role == "player":
            char_ids.append(char.id)

    if not char_ids:
        return

    page.shared_with = sorted(set(page.shared_with or []) | set(char_ids))
    db.session.commit()
    broadcast_wiki_page(page)

    # Apre la pagina come popup per i destinatari connessi
    for sid, char_id in list(client_character_ids.items()):
        if char_id in char_ids:
            socketio.emit("wiki_handout", {"id": page.id}, to=sid)


@socketio.on("wiki_delete_page")
def handle_wiki_delete_page(data):
    if request.sid not in master_sids:
        return

    page = db.session.get(WikiPage, (data or {}).get("id"))

    if not page:
        return

    page_id = page.id
    db.session.delete(page)
    db.session.commit()

    socketio.emit("wiki_page_removed", {"id": page_id})
