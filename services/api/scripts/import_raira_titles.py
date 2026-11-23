"""One-time import of Raira's films and series (exported as JSON) into Watch's titles.json.

Usage: python import_raira_titles.py raira-titles.json /path/to/watch-data/titles.json
Refuses to overwrite an existing titles.json, so a second run cannot erase what was added in Watch since.
"""
import json
import sys
import uuid
from collections import defaultdict
from pathlib import Path

src, dest = Path(sys.argv[1]), Path(sys.argv[2])
if dest.exists():
    sys.exit(f'{dest} already exists; not overwriting it.')
data = json.loads(src.read_text())
episodes = defaultdict(list)
for e in data['episodes']:
    episodes[e['title_id']].append({'season': e['season_number'], 'episode': e['episode_number'], 'watchedAt': e['watched_at'], 'runtime': e['runtime_minutes']})
titles = []
for t in data['titles']:
    eps = episodes.get(t['id'], [])
    finished = bool(t['watched_at'])
    status = 'finished' if finished else 'watching' if eps else 'watchlist'
    titles.append({
        'id': str(uuid.uuid4()), 'mediaType': t['media_type'], 'tmdbId': t['tmdb_id'], 'title': t['title'],
        'releaseDate': t['release_date'] or '', 'overview': t['overview'] or '', 'posterUrl': t['poster_url'] or '',
        'voteAverage': float(t['vote_average']) if t['vote_average'] is not None else None,
        'status': status, 'rating': t['rating'] or 0, 'favorite': bool(t['favorite']),
        'watchedAt': t['watched_at'], 'addedAt': t['created_at'], 'runtimeMinutes': t['runtime_minutes'],
        'genres': [g if isinstance(g, str) else g.get('name', '') for g in (t['genres'] or [])],
        'providers': [p if isinstance(p, str) else p.get('provider_name', '') for p in (t['providers'] or [])],
        'providersAt': t['providers_at'], 'episodeTotal': t['episode_total'], 'episodes': eps,
    })
titles.sort(key=lambda t: t['addedAt'], reverse=True)
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps({'titles': titles}))
dest.chmod(0o600)
print(f'{len(titles)} titles, {sum(len(t["episodes"]) for t in titles)} episodes')
