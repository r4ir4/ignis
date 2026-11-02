# Apple Reminders bridge

A read-only macOS EventKit helper reads all configured reminder lists. It is independent of the Calendar helper so adding Reminders does not rebuild or reset Calendar permission.

Build from the project root on macOS with Swift/Xcode command-line tools:

```sh
python3 services/reminders-bridge/build.py
```

The build creates and ad-hoc signs `~/Library/Application Support/Ignis/apple-reminders/Ignis Reminders Bridge.app`. Connect Apple Reminders from Ignis and approve the macOS Reminders permission. If denied, enable it in System Settings → Privacy & Security → Reminders, then reconnect.

Imports include all incomplete reminders (future and unscheduled items included) and reminders completed within the last 30 calendar days in Bahia time. Due dates, date-only deadlines, priorities, notes and recurring flags are retained. Recurring reminders are shown as returned by Apple; no future occurrences are generated. Completed and active records deduplicate by list plus calendar-item ID.

The helper contains no save, remove, complete or edit operations. It writes only private exports outside the repository (directory 0700, JSON 0600). Automatic imports launch through LaunchServices without requesting new permission; only the explicit connection action can request it. Failed exports/revoked permission preserve the last successful import.

This requires the local Mac helper. It is not a cloud connection, and a production server cannot directly access this Mac's reminder store. Data freshness depends on the account sync in Reminders on this Mac.
