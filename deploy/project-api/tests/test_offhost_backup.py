import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

root = Path(__file__).resolve().parents[1]
export_spec = importlib.util.spec_from_file_location('project_export', root / 'export_backup.py')
export_backup = importlib.util.module_from_spec(export_spec)
export_spec.loader.exec_module(export_backup)
pull_spec = importlib.util.spec_from_file_location('project_pull', root / 'pull_backups.py')
backup = importlib.util.module_from_spec(pull_spec)
pull_spec.loader.exec_module(backup)


def sample_data(directory: Path, text='kept'):
    data = directory / 'data'
    data.mkdir(parents=True)
    connection = sqlite3.connect(data / 'ignis.db')
    connection.execute('CREATE TABLE entries (text TEXT)')
    connection.execute('INSERT INTO entries VALUES (?)', (text,))
    connection.commit()
    connection.close()
    photos = data / 'trip-photos'
    photos.mkdir()
    (photos / 'abc.jpg').write_bytes(b'\xff\xd8photo')
    (photos / 'uploading.jpg.part').write_bytes(b'partial')
    (data / 'ignis.db.before-old').write_bytes(b'not part of the backup')
    return data


def exported(data: Path, destination: Path):
    buffer = io.BytesIO()
    export_backup.export(buffer, data)
    destination.write_bytes(buffer.getvalue())


class ProjectApiBackupTests(unittest.TestCase):
    def test_export_keeps_a_consistent_database_and_skips_partial_files(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            data = sample_data(base)
            bundle = base / 'bundle.tar'
            exported(data, bundle)
            snapshot = base / 'snapshot'
            snapshot.mkdir()
            manifest = backup.unpack(bundle, snapshot)
            self.assertEqual(manifest['kind'], 'project-api')
            self.assertEqual(set(manifest['files']), {'ignis.db', 'trip-photos/abc.jpg'})
            connection = sqlite3.connect(snapshot / 'ignis.db')
            self.assertEqual(connection.execute('SELECT text FROM entries').fetchone()[0], 'kept')
            connection.close()
            self.assertFalse((snapshot / 'ignis.db.before-old').exists())
            self.assertFalse((snapshot / 'trip-photos' / 'uploading.jpg.part').exists())

    def test_verified_bundle_publishes_a_private_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            source = base / 'bundle.tar'
            exported(sample_data(base / 'source'), source)
            destination = base / 'backups'

            def download(*args, **kwargs):
                kwargs['stdout'].write(source.read_bytes())

            with patch.object(backup.subprocess, 'run', side_effect=download):
                backup.pull(destination)
            status = json.loads((destination / 'status.json').read_text())
            self.assertTrue(status['ok'])
            self.assertEqual(status['tripPhotos'], 1)
            snapshot = destination / status['snapshot']
            self.assertEqual((snapshot / 'ignis.db').stat().st_mode & 0o777, 0o600)
            self.assertEqual(destination.stat().st_mode & 0o777, 0o700)

    def test_failed_download_retains_the_last_success(self):
        with tempfile.TemporaryDirectory() as directory:
            root_dir = Path(directory)
            (root_dir / 'previous').mkdir()
            (root_dir / 'previous' / 'ignis.db').write_bytes(b'previous')
            (root_dir / 'status.json').write_text(json.dumps({'ok': True, 'snapshot': 'previous', 'lastSuccessAt': 'earlier'}))
            with patch.object(backup.subprocess, 'run', side_effect=subprocess.TimeoutExpired('ssh', 660)), self.assertRaises(SystemExit):
                backup.pull(root_dir)
            status = json.loads((root_dir / 'status.json').read_text())
            self.assertFalse(status['ok'])
            self.assertEqual(status['lastSuccessAt'], 'earlier')
            self.assertEqual((root_dir / 'previous' / 'ignis.db').read_bytes(), b'previous')
            self.assertEqual(list(root_dir.glob('.pending-*')), [])

    def test_corrupt_archive_is_not_marked_successful(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            source = base / 'bundle.tar'
            exported(sample_data(base / 'source'), source)
            with tarfile.open(source, 'a') as archive:
                info = tarfile.TarInfo('ignis.db')
                payload = b'not a database'
                info.size = len(payload)
                archive.addfile(info, io.BytesIO(payload))
            destination = base / 'backups'

            def download(*args, **kwargs):
                kwargs['stdout'].write(source.read_bytes())

            with patch.object(backup.subprocess, 'run', side_effect=download), self.assertRaises(SystemExit):
                backup.pull(destination)
            self.assertFalse(json.loads((destination / 'status.json').read_text())['ok'])
            self.assertEqual([path for path in destination.iterdir() if path.is_dir()], [])

    def test_archive_cannot_write_outside_the_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            source = base / 'bundle.tar'
            exported(sample_data(base / 'source'), source)
            with tarfile.open(source, 'a') as archive:
                info = tarfile.TarInfo('../escaped.db')
                payload = b'outside'
                info.size = len(payload)
                archive.addfile(info, io.BytesIO(payload))
            target = base / 'snapshot'
            target.mkdir()
            with self.assertRaises(ValueError):
                backup.unpack(source, target)
            self.assertFalse((base / 'escaped.db').exists())

    def test_checksum_mismatch_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            source = base / 'bundle.tar'
            exported(sample_data(base / 'source'), source)
            manifest_bytes = None
            with tarfile.open(source) as archive:
                manifest_bytes = archive.extractfile('manifest.json').read()
            manifest = json.loads(manifest_bytes)
            manifest['files']['ignis.db']['sha256'] = hashlib.sha256(b'nope').hexdigest()
            rewritten = json.dumps(manifest).encode()
            out = base / 'rewritten.tar'
            with tarfile.open(source) as archive, tarfile.open(out, 'w') as copy:
                for member in archive.getmembers():
                    data = archive.extractfile(member).read()
                    if member.name == 'manifest.json':
                        data = rewritten
                        member.size = len(data)
                    copy.addfile(member, io.BytesIO(data))
            with self.assertRaises(ValueError):
                backup.unpack(out, base / 'snapshot')
