import AppKit
import EventKit
import Foundation

// Read-only bridge. No save, remove, commit or event modification operations.
final class CalendarBridge: NSObject, NSApplicationDelegate {
    let store = EKEventStore()
    let directory = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/Ignis/apple-calendar", isDirectory: true)
    func applicationDidFinishLaunching(_ notification: Notification) {
        let status = EKEventStore.authorizationStatus(for: .event)
        if status == .notDetermined && CommandLine.arguments.contains("--request-access") {
            store.requestFullAccessToEvents { granted, error in
                DispatchQueue.main.async {
                    if granted { self.export() }
                    else { self.finish(["connected": false, "authorization": "denied", "error": "Allow Ignis Calendar Bridge in System Settings → Privacy & Security → Calendars."]) }
                }
            }
        } else if status == .fullAccess {
            export()
        } else {
            finish(["connected": false, "authorization": status == .notDetermined ? "notDetermined" : "denied", "error": "Calendar access is required. Allow Ignis Calendar Bridge in System Settings → Privacy & Security → Calendars."])
        }
    }
    func export() {
        var dayCalendar = Calendar(identifier: .gregorian)
        dayCalendar.timeZone = TimeZone(identifier: "America/Bahia")!
        let today = dayCalendar.startOfDay(for: Date())
        let from = dayCalendar.date(byAdding: .day, value: -29, to: today)!
        let to = dayCalendar.date(byAdding: .day, value: 31, to: today)!
        let calendars = store.calendars(for: .event)
        let iso = ISO8601DateFormatter()
        let short = DateFormatter()
        short.dateFormat = "yyyy-MM-dd"
        short.timeZone = dayCalendar.timeZone
        let entries = calendars.map { calendar -> [String: Any] in
            ["id": calendar.calendarIdentifier, "name": calendar.title, "source": calendar.source.title, "type": calendar.type.rawValue]
        }
        let predicate = store.predicateForEvents(withStart: from, end: to, calendars: calendars)
        let events = store.events(matching: predicate).map { event -> [String: Any] in
            let start = event.startDate!
            let end = event.endDate!
            let id = event.eventIdentifier ?? event.calendarItemIdentifier
            var entry: [String: Any] = [
                "id": event.calendar.calendarIdentifier + ":" + id + ":" + iso.string(from: start),
                "providerId": id, "calendarId": event.calendar.calendarIdentifier,
                "title": event.title ?? "Untitled event", "start": iso.string(from: start), "end": iso.string(from: end),
                "allDay": event.isAllDay, "recurring": event.hasRecurrenceRules,
                "location": event.location ?? "", "notes": event.notes ?? "",
                "status": event.status.rawValue
            ]
            if event.isAllDay {
                // All-day dates are calendar dates, not timestamps to shift between time zones.
                let eventDay = DateFormatter()
                eventDay.dateFormat = "yyyy-MM-dd"
                eventDay.timeZone = event.timeZone ?? TimeZone.current
                entry["startDay"] = eventDay.string(from: start)
                entry["endDay"] = eventDay.string(from: end)
            }
            return entry
        }.sorted { ($0["start"] as! String) < ($1["start"] as! String) }
        finish(["connected": true, "authorization": "granted", "importedAt": Date().timeIntervalSince1970,
                "calendars": entries, "events": events, "timezone": "America/Bahia", "today": short.string(from: today),
                "rangeStart": short.string(from: from), "rangeEnd": short.string(from: dayCalendar.date(byAdding: .day, value: -1, to: to)!)])
    }
    func finish(_ data: [String: Any]) {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let json = try JSONSerialization.data(withJSONObject: data, options: [.sortedKeys])
            let target = directory.appendingPathComponent("latest.json")
            try json.write(to: target, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: target.path)
        } catch {
            // No event contents are written to logs.
            fputs("Could not save the local calendar snapshot.\n", stderr)
        }
        NSApplication.shared.terminate(nil)
    }
}
let app = NSApplication.shared
let bridge = CalendarBridge()
app.delegate = bridge
app.setActivationPolicy(.accessory)
app.run()
