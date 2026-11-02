import test from 'node:test'
import assert from 'node:assert/strict'
import { toggleHabitDay, validHabits, shiftHabitDay, localHabitDay } from '../src/features/notebook/habitsModel.ts'
import { validPages, samePages } from '../src/features/notebook/notebookModel.ts'
import { defaultViewConfig } from '../src/features/notebook/viewModel.ts'
const habitsPage = { id: '1d8d1aa0-1b11-4011-8011-555555555555', kind: 'habits', title: 'Habits', icon: 'icon:target', parentId: null, fullWidth: true, lists: [], content: { type: 'doc', content: [{ type: 'viewBlock', attrs: defaultViewConfig('dashboard') }] } }
const habit = () => ({ id: crypto.randomUUID(), title: 'Read', createdOn: '2026-10-01', completions: ['2026-10-17'], archived: false })
test('Habit check-ins are reversible by date and preserve other marks and habits', () => {
  const a = habit(), b = habit(), original = [a, b]
  const marked = toggleHabitDay(original, a.id, '2026-10-18', '2026-10-18')
  assert.deepEqual(marked[0].completions, ['2026-10-17', '2026-10-18'])
  assert.equal(marked[1], b)
  assert.deepEqual(a.completions, ['2026-10-17'])
  assert.deepEqual(toggleHabitDay(marked, a.id, '2026-10-18', '2026-10-18'), original)
  for (const day of ['2026-09-30', '2026-10-19', '2026-02-30']) assert.deepEqual(toggleHabitDay(original, a.id, day, '2026-10-18'), original)
  const archived = [{ ...a, archived: true }]
  assert.deepEqual(toggleHabitDay(archived, a.id, '2026-10-18', '2026-10-18'), archived)
})
test('Habit schema and save acknowledgements retain date history', () => {
  const result = { pages: [habitsPage] }, page = { ...habitsPage, habits: [habit()] }
  assert.ok(validPages([page]))
  assert.ok(samePages([page], [structuredClone(page)]))
  assert.equal(samePages([page], [{ ...page, habits: toggleHabitDay(page.habits, page.habits[0].id, '2026-10-18', '2026-10-18') }]), false)
  assert.ok(samePages(result.pages, [{ ...result.pages[0], habits: null }]))
  for (const patch of [{ title: ' ' }, { completions: ['2026-02-30'] }, { completions: ['2026-09-30'] }, { completions: ['2026-10-17', '2026-10-17'] }, { archived: 1 }]) assert.equal(validHabits([{ ...habit(), ...patch }]), false)
  const a = habit(); assert.equal(validHabits([a, a]), false)
  assert.equal(shiftHabitDay('2026-03-01', -1), '2026-02-28')
  assert.equal(shiftHabitDay('2024-03-01', -1), '2024-02-29')
  assert.match(localHabitDay(), /^\d{4}-\d{2}-\d{2}$/)
})

test('Raira habit marks keep source period targets and protect linked medication and rest days', async () => {
  const { rairaHabitMark } = await import('../src/features/notebook/rairaHabitsModel.ts')
  const habit = { id: 7, status: 'active', medication_linked: false, due: true, rest_day: false, start_date: '2026-10-01', period_key: '2026-10-12', completed_count: 2, target_count: 3 }
  assert.deepEqual(rairaHabitMark(habit, '2026-10-18'), { habit_id: 7, date: '2026-10-18', period_key: '2026-10-12', expected_count: 2, desired_count: 3 })
  assert.equal(rairaHabitMark(habit, '2026-10-18', true).desired_count, 1)
  for (const patch of [{ medication_linked: true }, { rest_day: true }, { due: false }, { status: 'paused' }, { completed_count: 3 }]) assert.equal(rairaHabitMark({ ...habit, ...patch }, '2026-10-18'), null)
  assert.equal(rairaHabitMark({ ...habit, completed_count: 0 }, '2026-10-18', true), null)
  assert.equal(rairaHabitMark(habit, '2026-09-30'), null)
})

test('Habit calendars align weekdays, leap months and year navigation', async () => {
  const { habitMonthDays, shiftHabitMonth, habitHeatmapDays } = await import('../src/features/notebook/habitCalendarModel.ts')
  const february = habitMonthDays('2024-02')
  assert.equal(february.slice(0, 4).every(day => day === null), true)
  assert.equal(february.filter(Boolean).length, 29)
  assert.equal(february.at(-1), '2024-02-29')
  assert.equal(habitMonthDays('2026-11')[0], '2026-11-01')
  assert.equal(shiftHabitMonth('2026-01', -1), '2025-12')
  assert.equal(shiftHabitMonth('2026-12', 1), '2027-01')
  const heatmap = habitHeatmapDays('2026-10-18')
  assert.equal(heatmap.length, 112)
  assert.equal(new Set(heatmap).size, 112)
  assert.equal(new Date(heatmap[0] + 'T12:00:00Z').getUTCDay(), 0)
  assert.equal(heatmap.at(-1), '2026-10-24')
})
test('Habit visuals distinguish absent history, rest days, partial and completed targets', async () => {
  const { habitDayState } = await import('../src/features/notebook/habitCalendarModel.ts')
  const habit = { start_date: '2026-10-01', target_count: 3 }, day = '2026-10-18'
  const period = { date: day, count: 1, checked: false, rest: false }
  assert.equal(habitDayState(habit, day, day, period), 'partial')
  assert.equal(habitDayState(habit, day, day, { ...period, count: 3, checked: true }), 'complete')
  assert.equal(habitDayState(habit, day, day, { ...period, count: 0 }), 'empty')
  assert.equal(habitDayState(habit, day, day, { ...period, rest: true }), 'rest')
  assert.equal(habitDayState(habit, day, day), 'unknown')
  assert.equal(habitDayState(habit, '2026-09-30', day, period), 'unknown')
  assert.equal(habitDayState(habit, '2026-10-19', day, period), 'unknown')
})


test('Migrated medication habits can be checked in natively without enabling provider writes', async () => {
  const { rairaHabitMark } = await import('../src/features/notebook/rairaHabitsModel.ts')
  const habit = { id: 7, status: 'active', medication_linked: true, due: true, rest_day: false, start_date: '2026-10-01', period_key: '2026-10-18', completed_count: 0, target_count: 1 }
  assert.equal(rairaHabitMark(habit, '2026-10-18'), null)
  assert.equal(rairaHabitMark(habit, '2026-10-18', false, true).desired_count, 1)
})

 test('Day squares use the selected date and protect unavailable and linked past days', async () => {
  const { habitDayMark } = await import('../src/features/notebook/rairaHabitsModel.ts')
  const habit = { id: 1, status: 'active', cadence: 'daily', medication_linked: false, start_date: '2026-10-01', target_count: 1, history: [{ date: '2026-10-16', count: 0, checked: false, rest: false }] }
  assert.deepEqual(habitDayMark(habit, '2026-10-16', '2026-10-18'), { habit_id: 1, date: '2026-10-16', period_key: '2026-10-16', expected_count: 0, desired_count: 1 })
  const done = { ...habit, history: [{ ...habit.history[0], count: 1, checked: true }] }
  assert.equal(habitDayMark(done, '2026-10-16', '2026-10-18').desired_count, 0)
  for (const patch of [{ status: 'paused' }, { medication_linked: true }, { history: [] }, { history: [{ ...habit.history[0], rest: true }] }]) assert.equal(habitDayMark({ ...habit, ...patch }, '2026-10-16', '2026-10-18'), null)
  assert.equal(habitDayMark(habit, '2026-10-16', '2026-10-15'), null)
})
