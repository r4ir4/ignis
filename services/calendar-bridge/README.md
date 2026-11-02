# Apple Calendar bridge

A local macOS EventKit helper reads every configured event calendar, including iCloud, Google, Exchange and local calendars available to this Mac. It does not read reminders or create, edit, save or remove events.

Build from the project root on macOS (Swift/Xcode command-line tools required):

```sh
python3 services/calendar-bridge/build.py
```

The build creates and ad-hoc signs `~/Library/Application Support/Ignis/apple-calendar/Ignis Calendar Bridge.app`. The executable stays outside the repository. Connect Apple Calendar from the Ignis web screen and grant the macOS Calendar permission. On macOS 14+, EventKit calls the permission “Full Access”; the helper contains only read operations.

The API launches the helper through LaunchServices. A permission request is explicit; subsequent syncs never ask for permission automatically. Rebuilding the helper can require granting permission again. If denied, use System Settings → Privacy & Security → Calendars.

Exports include all configured event calendars and occurrences from the previous 29 days through the next 30 days, including today. Timed events retain ISO timestamps, all-day events retain calendar dates, and recurring occurrences use calendar + provider identifier + start timestamp for identity.

The private export and last successful import are stored outside the repository under the same directory, with directory permissions 0700 and JSON permissions 0600. Errors preserve the last successful import; no calendar contents appear in terminal logs.

This is a local Mac integration, not a cloud service. A deployed web server cannot access this Mac’s EventKit store without a separately designed bridge. Calendar data freshness also depends on Apple Calendar/account synchronization on the Mac.
