"""Install the explicitly selected Mac off-host destination as a user LaunchAgent."""
from pathlib import Path
import os
import plistlib
import shutil
import subprocess

base = Path.home() / 'Library/Application Support/Ignis/notebook/offhost'
base.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chmod(base, 0o700)
script = base / 'pull_backups.py'
shutil.copyfile(Path(__file__).with_name('pull_backups.py'), script)
os.chmod(script, 0o600)
python = shutil.which('python3')
if not python:
    raise SystemExit('Python 3.11 or newer is required.')
label = 'farm.ignis.notebook.offhost-backup'
agent = Path.home() / 'Library/LaunchAgents' / (label + '.plist')
agent.parent.mkdir(parents=True, exist_ok=True)
job = {'Label': label, 'ProgramArguments': [python, str(script), '--destination', str(base / 'snapshots')],
       'RunAtLoad': True, 'StartInterval': 21600, 'ProcessType': 'Background', 'ThrottleInterval': 300,
       'StandardOutPath': str(base / 'backup.log'), 'StandardErrorPath': str(base / 'backup-error.log')}
for name in ['backup.log', 'backup-error.log']:
    path = base / name
    path.touch(mode=0o600, exist_ok=True)
    os.chmod(path, 0o600)
with agent.open('wb') as stream:
    plistlib.dump(job, stream)
os.chmod(agent, 0o600)
domain = f'gui/{os.getuid()}'
# A repeat install reloads only this backup job; no other agent is affected.
subprocess.run(['/bin/launchctl', 'bootout', domain + '/' + label], capture_output=True)
subprocess.run(['/bin/launchctl', 'bootstrap', domain, str(agent)], check=True)
print('Installed notebook backup pull: every six hours while this Mac is awake and signed in.')
print('Destination: ' + str(base / 'snapshots'))
