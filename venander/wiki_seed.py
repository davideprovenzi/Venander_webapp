"""Importazione iniziale, una sola volta, della wiki pubblica UltraWiki."""
import json
from pathlib import Path

from venander.core import db
from venander.models import WikiPage, WikiImport


def seed_ultrawiki():
    source = "ultrawiki-0.02"
    if db.session.get(WikiImport, source):
        return

    path = Path(__file__).resolve().parent.parent / "data" / f"{source}.json"
    pages = json.loads(path.read_text(encoding="utf-8"))
    existing_titles = {page.title.strip().casefold() for page in WikiPage.query.all()}
    for page in pages:
        # Conserva pagine già create dal Master, anche in caso di omonimia.
        if page["title"].strip().casefold() not in existing_titles:
            db.session.add(WikiPage(**page))
            existing_titles.add(page["title"].strip().casefold())
    db.session.add(WikiImport(id=source))
    db.session.commit()
