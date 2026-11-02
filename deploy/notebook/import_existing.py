"""Explicit one-time migration into an EMPTY notebook database; retains all sources.
Input contains local database pages/history and UI-exported browser notebooks.
Run in the hosted API runtime with a private input file, after independent backups.
"""
import argparse
from datetime import datetime, timezone
import json
from uuid import uuid4
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.db.notebook import engine
from app.models.notebook import Workspace, Page, History
from app.schemas.notebook import Snapshot, NotebookPage


def canonical(page):
    return NotebookPage.model_validate(page).model_dump(mode='json')


def merge_sources(database, sources):
    pages = [canonical(p) for p in database['pages']]
    maps = []
    for source in sources:
        incoming = [canonical(p) for p in source['pages']]
        Snapshot(revision=0, pages=incoming)
        existing = {p['id']: p for p in pages}
        mapping = {p['id']: p['id'] for p in incoming}
        # Copy conflicting IDs and propagate remapped parents through the subtree.
        changed = True
        while changed:
            changed = False
            for p in incoming:
                parent = mapping.get(p['parentId'], p['parentId'])
                adjusted = {**p, 'parentId': parent}
                if mapping[p['id']] == p['id'] and p['id'] in existing and existing[p['id']] != adjusted:
                    mapping[p['id']] = str(uuid4()); changed = True
        for p in incoming:
            adjusted = {**p, 'id': mapping[p['id']], 'parentId': mapping.get(p['parentId'], p['parentId'])}
            if adjusted['id'] in existing:
                assert existing[adjusted['id']] == adjusted
            else:
                pages.append(adjusted); existing[adjusted['id']] = adjusted
        maps.append(mapping)
    Snapshot(revision=database['revision'] + 1, pages=pages)
    return pages, maps


def run(data, apply=False):
    database, sources = data['database'], data['browserSources']
    pages, maps = merge_sources(database, sources)
    old_history = database['history']
    local_ids = {p['id'] for p in database['pages']}
    for h in old_history:
        assert h['pageId'] in local_ids and h['page']['id'] == h['pageId']
        assert 0 <= h['revision'] <= database['revision']
        canonical(h['page']); datetime.fromisoformat(h['savedAt'])
    with Session(engine()) as session, session.begin():
        workspace = session.scalar(select(Workspace).where(Workspace.id == 1).with_for_update())
        if not workspace or workspace.revision != 0 or session.scalar(select(func.count()).select_from(Page)) or session.scalar(select(func.count()).select_from(History)):
            raise ValueError('Destination is not empty. Refusing to replace existing notebook data.')
        if apply:
            workspace.revision = database['revision'] + 1
            for position, p in enumerate(pages):
                session.add(Page(id=p['id'], position=position, payload=p))
            session.flush()
            for h in old_history:
                session.add(History(page_id=h['pageId'], revision=h['revision'], saved_at=datetime.fromisoformat(h['savedAt']), payload=h['page']))
            session.flush()
            for p in pages:
                session.add(History(page_id=p['id'], revision=workspace.revision, saved_at=datetime.now(timezone.utc), payload=p))
            session.flush()
            actual = {p.id: p.payload for p in session.scalars(select(Page))}
            for p in database['pages']:
                assert actual[p['id']] == canonical(p)
            for source, mapping in zip(sources, maps):
                for p in source['pages']:
                    expected = canonical(p)
                    expected.update(id=mapping[p['id']], parentId=mapping.get(p['parentId'], p['parentId']))
                    assert actual[expected['id']] == expected
    print(json.dumps({'applied': apply, 'pages': len(pages), 'active': sum(not p.get('deletedAt') for p in pages), 'trashed': sum(bool(p.get('deletedAt')) for p in pages), 'preservedHistory': len(old_history), 'newRevision': database['revision'] + 1, 'browserSourceMaps': maps}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('input')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    run(json.loads(open(args.input).read()), args.apply)
