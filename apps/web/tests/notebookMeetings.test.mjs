import test from 'node:test'
import assert from 'node:assert/strict'
import { groupMeetingsByDay, meetingsForDay } from '../src/features/notebook/meetings.ts'
test('today includes earlier meetings and excludes other days and malformed events', () => {
  const now = new Date(2026, 9, 17, 12)
  const event = (id, day, hour, endDay = day, endHour = hour + 1) => ({ id, title: id, start: new Date(2026, 9, day, hour).toISOString(), end: new Date(2026, 9, endDay, endHour).toISOString(), allDay: false })
  const events = [event('yesterday', 16, 12), event('tomorrow', 18, 0), event('morning', 17, 9), event('evening', 17, 18), event('overnight', 16, 23, 17, 1), event('ends-at-midnight', 16, 23, 17, 0), { id: 'bad', title: 'bad', start: 'invalid', end: 'invalid' }]
  assert.deepEqual(meetingsForDay(events, now).map(e => e.id), ['overnight', 'morning', 'evening'])
  assert.deepEqual(meetingsForDay(events, new Date(2026, 9, 18, 0)).map(e => e.id), ['tomorrow'])
})

test('today honors all-day date ranges with an exclusive end date', () => {
  const event = (id, startDay, endDay) => ({ id, title: id, start: `${startDay}T00:00:00Z`, end: `${endDay}T00:00:00Z`, allDay: true, startDay, endDay })
  const events = [event('spanning', '2026-10-16', '2026-10-18'), event('ended', '2026-10-16', '2026-10-17'), event('future', '2026-10-18', '2026-10-19')]
  assert.deepEqual(meetingsForDay(events, new Date(2026, 9, 17, 12)).map(e => e.id), ['spanning'])
})

test('meetings group by local day in chronological order with relative headings', () => {
  const now = new Date(2026, 9, 17, 12)
  const event = (id, day, hour) => ({ id, title: id, start: new Date(2026, 9, day, hour).toISOString(), end: new Date(2026, 9, day, hour + 1).toISOString(), allDay: false })
  const groups = groupMeetingsByDay([event('later', 19, 14), event('tomorrow', 18, 10), event('second', 17, 16), event('first', 17, 13)], now)
  assert.deepEqual(groups.map(group => [group.day, group.label, group.events.map(e => e.id)]), [
    ['2026-10-17', 'Today', ['first', 'second']],
    ['2026-10-18', 'Tomorrow', ['tomorrow']],
    ['2026-10-19', 'Monday, Oct 19', ['later']],
  ])
})

test('all-day dates ignore timestamp offsets and ongoing meetings appear under Today', () => {
  const now = new Date(2026, 9, 17, 12)
  const events = [
    { id: 'all-day', title: 'All day', start: '2026-10-18T23:00:00-10:00', end: '2026-10-20T00:00:00Z', allDay: true, startDay: '2026-10-18' },
    { id: 'ongoing', title: 'Ongoing', start: new Date(2026, 9, 16, 23).toISOString(), end: new Date(2026, 9, 17, 14).toISOString(), allDay: false },
  ]
  assert.deepEqual(groupMeetingsByDay(events, now).map(group => [group.label, group.events[0].id]), [['Today', 'ongoing'], ['Tomorrow', 'all-day']])
})
