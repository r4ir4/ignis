"""Hosted backup retries while the notebook is idle; dumps are never auto-pruned."""
import time
from .services.notebook_backup import backup_daily

if __name__ == '__main__':
    while True:
        backup_daily()
        time.sleep(3600)
