"""Build the read-only EventKit helper privately on this Mac."""
import os
import plistlib
import subprocess
from pathlib import Path

source = Path(__file__).resolve().parent / 'main.swift'
private = Path.home() / 'Library/Application Support/Ignis/apple-reminders'
private.mkdir(parents=True, exist_ok=True)
os.chmod(private, 0o700)
contents = private / 'Ignis Reminders Bridge.app/Contents'
(contents / 'MacOS').mkdir(parents=True, exist_ok=True)
with (contents / 'Info.plist').open('wb') as output:
    plistlib.dump({'CFBundleIdentifier': 'farm.ignis.reminders-bridge', 'CFBundleName': 'Ignis Reminders Bridge',
                  'CFBundleExecutable': 'reminders-bridge', 'CFBundlePackageType': 'APPL', 'CFBundleVersion': '1',
                  'LSUIElement': True, 'NSRemindersFullAccessUsageDescription': 'Ignis reads your Apple Reminders lists and reminders to display your day. It does not create, edit, complete or delete reminders.'}, output)
subprocess.run(['/usr/bin/swiftc', '-O', str(source), '-o', str(contents / 'MacOS/reminders-bridge'), '-framework', 'AppKit', '-framework', 'EventKit'], check=True)
subprocess.run(['/usr/bin/codesign', '--force', '--sign', '-', str(contents.parent)], check=True, capture_output=True)
print('Built Ignis Reminders Bridge privately. Connect Apple Reminders from Ignis.')
