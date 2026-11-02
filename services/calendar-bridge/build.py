"""Build the read-only EventKit helper privately on this Mac."""
import os
import plistlib
import subprocess
from pathlib import Path

source = Path(__file__).resolve().parent / 'main.swift'
private = Path.home() / 'Library/Application Support/Ignis/apple-calendar'
private.mkdir(parents=True, exist_ok=True)
os.chmod(private, 0o700)
contents = private / 'Ignis Calendar Bridge.app/Contents'
(contents / 'MacOS').mkdir(parents=True, exist_ok=True)
with (contents / 'Info.plist').open('wb') as output:
    plistlib.dump({'CFBundleIdentifier': 'farm.ignis.calendar-bridge', 'CFBundleName': 'Ignis Calendar Bridge',
                  'CFBundleExecutable': 'calendar-bridge', 'CFBundlePackageType': 'APPL', 'CFBundleVersion': '1',
                  'LSUIElement': True, 'NSCalendarsFullAccessUsageDescription': 'Ignis reads your Apple Calendar events to display and sync your day. It does not create, edit or delete events.'}, output)
subprocess.run(['/usr/bin/swiftc', '-O', str(source), '-o', str(contents / 'MacOS/calendar-bridge'), '-framework', 'AppKit', '-framework', 'EventKit'], check=True)
subprocess.run(['/usr/bin/codesign', '--force', '--sign', '-', str(contents.parent)], check=True, capture_output=True)
print('Built Ignis Calendar Bridge privately. Connect Apple Calendar from Ignis.')
