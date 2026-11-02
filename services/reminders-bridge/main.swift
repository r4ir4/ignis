import AppKit
import EventKit
import Foundation

// Read-only bridge. No save, remove, commit or event modification operations.
final class RemindersBridge: NSObject, NSApplicationDelegate {
    let store = EKEventStore()
    let directory = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/Ignis/apple-reminders", isDirectory: true)
    func applicationDidFinishLaunching(_ notification: Notification) {
        let status = EKEventStore.authorizationStatus(for: .reminder)
        if status == .notDetermined && CommandLine.arguments.contains("--request-access") {
            store.requestFullAccessToReminders { granted, error in
                DispatchQueue.main.async {
                    if granted { self.export() }
                    else { self.finish(["connected": false, "authorization": "denied", "error": "Allow Ignis Reminders Bridge in System Settings → Privacy & Security → Reminders."]) }
                }
            }
        } else if status == .fullAccess {
            export()
        } else {
            finish(["connected": false, "authorization": status == .notDetermined ? "notDetermined" : "denied", "error": "Reminders access is required. Allow Ignis Reminders Bridge in System Settings → Privacy & Security → Reminders."])
        }
    }
    func export() {
        let lists = store.calendars(for: .reminder)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Bahia")!
        let today = calendar.startOfDay(for: Date())
        let from = calendar.date(byAdding: .day, value: -29, to: today)!
        let to = calendar.date(byAdding: .day, value: 1, to: today)!
        let active = store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: lists)
        let completed = store.predicateForCompletedReminders(withCompletionDateStarting: from, ending: to, calendars: lists)
        var batches: [[EKReminder]] = []
        for predicate in [active, completed] {
            store.fetchReminders(matching: predicate) { reminders in
                DispatchQueue.main.async {
                    guard let reminders = reminders else {
                        self.finish(["connected": false, "authorization": "unavailable", "error": "Reminders could not be read. Reconnect to retry."])
                        return
                    }
                    batches.append(reminders)
                    if batches.count == 2 { self.writeReminders(batches.flatMap { $0 }, lists: lists, from: from, today: today) }
                }
            }
        }
    }
    func writeReminders(_ reminders: [EKReminder], lists: [EKCalendar], from: Date, today: Date) {
        let iso = ISO8601DateFormatter()
        let day = DateFormatter()
        day.dateFormat = "yyyy-MM-dd"
        day.timeZone = TimeZone(identifier: "America/Bahia")!
        let entries = lists.map { list -> [String: Any] in
            ["id": list.calendarIdentifier, "name": list.title, "source": list.source.title]
        }
        var unique: [String: [String: Any]] = [:]
        for reminder in reminders {
            let id = reminder.calendar.calendarIdentifier + ":" + reminder.calendarItemIdentifier
            var entry: [String: Any] = ["id": id, "providerId": reminder.calendarItemIdentifier,
                "listId": reminder.calendar.calendarIdentifier, "title": reminder.title ?? "Untitled reminder",
                "notes": reminder.notes ?? "", "completed": reminder.isCompleted,
                "recurring": reminder.hasRecurrenceRules, "priority": reminder.priority]
            if let completion = reminder.completionDate { entry["completedAt"] = iso.string(from: completion) }
            if let components = reminder.dueDateComponents {
                if let year = components.year, let month = components.month, let date = components.day {
                    entry["dueDay"] = String(format: "%04d-%02d-%02d", year, month, date)
                }
                entry["allDay"] = components.hour == nil
                if components.hour != nil {
                    var calendar = components.calendar ?? Calendar(identifier: .gregorian)
                    calendar.timeZone = components.timeZone ?? TimeZone.current
                    if let due = calendar.date(from: components) { entry["due"] = iso.string(from: due) }
                }
            }
            unique[id] = entry
        }
        let records = unique.values.sorted { ($0["title"] as! String) < ($1["title"] as! String) }
        finish(["connected": true, "authorization": "granted", "importedAt": Date().timeIntervalSince1970,
                "lists": entries, "reminders": records, "timezone": "America/Bahia", "today": day.string(from: today),
                "rangeStart": day.string(from: from), "rangeEnd": day.string(from: today)])
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
let bridge = RemindersBridge()
app.delegate = bridge
app.setActivationPolicy(.accessory)
app.run()
