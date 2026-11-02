import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('pull_backup', Path(__file__).resolve().parents[1] / 'pull_backups.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


def bundle(path, corrupt=False, extra=False):
    files = {'staging.dump': b'PGDMPstaging fixture', 'production.dump': b'PGDMPproduction fixture'}
    manifest = {'format': 1, 'createdAt': '2026-10-17T15:00:00+00:00', 'files': {name: {'size': len(value), 'sha256': hashlib.sha256(value).hexdigest()} for name, value in files.items()}}
    if corrupt:
        files['production.dump'] += b'corruption'
    files['manifest.json'] = json.dumps(manifest).encode()
    if extra:
        files['../escaped.dump'] = b'PGDMPoutside'
    with tarfile.open(path, 'w') as archive:
        for name, value in files.items():
            entry = tarfile.TarInfo(name)
            entry.size = len(value)
            archive.addfile(entry, io.BytesIO(value))


class OffHostBackupTests(unittest.TestCase):
    def test_verified_bundle_publishes_both_databases_and_private_status(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'backups'
            source = Path(directory) / 'bundle.tar'
            bundle(source)
            def download(*args, **kwargs):
                kwargs['stdout'].write(source.read_bytes())
            with patch.object(backup.subprocess, 'run', side_effect=download):
                backup.pull(root)
            status = json.loads((root / 'status.json').read_text())
            self.assertTrue(status['ok'])
            snapshot = root / status['snapshot']
            self.assertEqual((snapshot / 'staging.dump').read_bytes(), b'PGDMPstaging fixture')
            self.assertEqual((snapshot / 'production.dump').stat().st_mode & 0o777, 0o600)
            self.assertEqual(root.stat().st_mode & 0o777, 0o700)

    def test_failed_download_retains_last_success_and_never_publishes_partial_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'previous').mkdir()
            (root / 'previous/staging.dump').write_bytes(b'PGDMPprevious')
            (root / 'status.json').write_text(json.dumps({'ok': True, 'snapshot': 'previous', 'lastSuccessAt': 'earlier'}))
            with patch.object(backup.subprocess, 'run', side_effect=subprocess.TimeoutExpired('ssh', 660)), self.assertRaises(SystemExit):
                backup.pull(root)
            status = json.loads((root / 'status.json').read_text())
            self.assertFalse(status['ok'])
            self.assertEqual(status['lastSuccessAt'], 'earlier')
            self.assertEqual((root / 'previous/staging.dump').read_bytes(), b'PGDMPprevious')
            self.assertEqual(list(root.glob('.pending-*')), [])

    def test_corrupt_archive_is_not_marked_successful(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'bundle.tar'
            bundle(source, corrupt=True)
            root = Path(directory) / 'backups'
            def download(*args, **kwargs):
                kwargs['stdout'].write(source.read_bytes())
            with patch.object(backup.subprocess, 'run', side_effect=download), self.assertRaises(SystemExit):
                backup.pull(root)
            self.assertFalse(json.loads((root / 'status.json').read_text())['ok'])
            self.assertEqual([p for p in root.iterdir() if p.is_dir()], [])

    def test_archive_cannot_write_outside_the_new_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'bundle.tar'
            bundle(source, extra=True)
            target = Path(directory) / 'snapshot'
            target.mkdir()
            with self.assertRaises(ValueError):
                backup.unpack(source, target)
            self.assertFalse((Path(directory) / 'escaped.dump').exists())
