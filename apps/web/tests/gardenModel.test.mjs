import test from 'node:test'
import assert from 'node:assert/strict'
import { gardenGrowth, isDayEntry, isTask, plantStages } from '../src/features/garden/gardenModel.ts'
const task = { id: 1, title: 'One step', group: 'Priority', done: true }
const exercise = { id: 'exercise', kind: 'Exercise', time: '17:00', title: 'Movement', detail: '', done: true }
const habit = { ...exercise, id: 'habit', kind: 'Habit' }
const log = { id: 'log-1', date: '2026-10-12', time: '12:30', name: 'Lunch', food: 'Soup', notes: '' }

test('completed tasks, exercise, habits and food logs each contribute once', () => {
  const entries = [exercise, habit, { ...exercise, id: 'meds', kind: 'Meds' }, { ...exercise, id: 'food-plan', kind: 'Food' }]
  assert.equal(gardenGrowth([task, task], [...entries, exercise], [log, log]), 4)
  assert.equal(gardenGrowth([{ ...task, done: false }], [{ ...habit, done: false }], []), 0)
})
test('undo reverses the original contribution; edits do not add growth', () => {
  assert.equal(gardenGrowth([task], [habit], [log]), 3)
  assert.equal(gardenGrowth([{ ...task, done: false }], [habit], [log]), 2)
  assert.equal(gardenGrowth([task], [habit], [{ ...log, food: 'A different meal' }]), 3)
  assert.equal(gardenGrowth([task], [habit], []), 2)
})
test('plants grow in turn and never expire based on dates', () => {
  assert.deepEqual(plantStages(0), [0, 0, 0])
  assert.deepEqual(plantStages(1), [1, 0, 0])
  assert.deepEqual(plantStages(4), [2, 1, 1])
  assert.deepEqual(plantStages(9), [3, 3, 3])
  assert.deepEqual(plantStages(100), [3, 3, 3])
  assert.equal(gardenGrowth([], [], [{ ...log, date: '2020-01-01' }]), 1)
})
test('check-ins survive JSON serialization and invalid records are rejected', () => {
  assert.equal(isTask(JSON.parse(JSON.stringify(task))), true)
  assert.equal(isDayEntry(JSON.parse(JSON.stringify(exercise))), true)
  assert.equal(isTask({ ...task, done: 'yes' }), false)
  assert.equal(isDayEntry({ ...exercise, kind: 'Unknown' }), false)
})
