"""Create today's notebook backup without reading or changing any other product data."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.notebook_backup import backup_daily
from app.db.notebook import DATA
backup_daily()
error = DATA / 'backups/backup-error.txt'
if error.exists():
    raise SystemExit(error.read_text())
print('Notebook backup available in the private Ignis notebook/backups directory.')
