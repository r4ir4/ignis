# Project API backups

`services/project-api` is the live source. This folder is how that SQLite database leaves the VPS.

The database at `/opt/ignis/api/data/ignis.db` holds the diary, meds, money, labs, and the other project.ignis.farm records. Wishlist pictures and book covers are inside that file. Trip photos sit beside it. Secrets stay in `/opt/ignis/api/secrets` and are not part of the backup. Older `ignis.db.before-*` copies on the server are not copied either.

The exporter takes an online SQLite backup, so a live WAL write is included, then checks integrity. The Mac pulls that archive over the existing `cabecao` SSH host, checks every checksum, and checks integrity again before keeping the snapshot.

Install, after this Mac is the backup destination:

```sh
ssh cabecao 'mkdir -p /opt/ignis/api/scripts; chmod 700 /opt/ignis/api/scripts'
scp deploy/project-api/export_backup.py cabecao:/opt/ignis/api/scripts/export_backup.py
python3 deploy/project-api/install_mac_backups.py
```

The job is `farm.ignis.project-api.offhost-backup`. It runs when loaded and every six hours while this Mac is awake and signed in. Snapshots land in `~/Library/Application Support/Ignis/project-api/offhost/snapshots/`, mode 0700 for the folder and 0600 for the files. A failed pull leaves the previous snapshot in place.

```sh
python3 -m unittest discover -s deploy/project-api/tests -q
launchctl print gui/$(id -u)/farm.ignis.project-api.offhost-backup
```

Restoring means copying a verified `ignis.db` to a new empty file and opening it, then putting trip photos beside it. Do not copy a snapshot over the live database.
