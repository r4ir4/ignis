import test from 'node:test'
import assert from 'node:assert/strict'
import { copyMeal, emptyFood, foodDayEntries, isFoodState, normalizeFoodState, removeMeal, saveMeal, removeLog, removePlan, saveLog, savePlan } from '../src/features/food/foodModel.ts'
const plan = { id: 'meal-1', date: '2026-10-12', name: 'Lunch', time: '12:30', food: 'Rice and beans', notes: 'Ready in the fridge' }
const log = { id: 'log-1', planId: plan.id, date: plan.date, name: 'Lunch', time: '13:10', food: 'Half a sandwich', notes: 'Changed the plan' }

test('logging actual food and editing the plan preserve independent records', () => {
  const planned = savePlan(emptyFood, plan)
  const eaten = saveLog(planned, log)
  assert.equal(eaten.plans[0].food, 'Rice and beans')
  assert.equal(eaten.logs[0].food, 'Half a sandwich')
  assert.equal(foodDayEntries(eaten, plan.date)[0].done, true)
  const changed = savePlan(eaten, { ...plan, food: 'Soup' })
  assert.equal(changed.logs[0].food, 'Half a sandwich')
  assert.equal(planned.plans[0].food, 'Rice and beans')
})
test('removing a plan keeps the eating history', () => {
  const state = removePlan(saveLog(savePlan(emptyFood, plan), log), plan.id)
  assert.equal(state.plans.length, 0)
  assert.deepEqual(state.logs, [log])
})
test('day completion requires a linked log on the same date', () => {
  const state = savePlan(emptyFood, plan)
  assert.equal(foodDayEntries(saveLog(state, { ...log, planId: undefined }), plan.date)[0].done, false)
  assert.equal(foodDayEntries(saveLog(state, { ...log, date: '2026-10-13' }), plan.date)[0].done, false)
  assert.deepEqual(foodDayEntries(state, '2026-10-13'), [])
  const undone = removeLog(saveLog(state, log), log.id)
  assert.equal(foodDayEntries(undone, plan.date)[0].done, false)
})
test('edited logs replace their record and survive a storage round trip', () => {
  const original = saveLog(savePlan(emptyFood, plan), log)
  const edited = saveLog(original, { ...log, food: 'A sandwich and an apple' })
  assert.equal(edited.logs.length, 1)
  assert.equal(edited.logs[0].food, 'A sandwich and an apple')
  assert.equal(isFoodState(JSON.parse(JSON.stringify(edited))), true)
  assert.equal(isFoodState({ plans: [{ ...plan, time: '99:99' }], logs: [] }), false)
  assert.equal(isFoodState(null), false)
})

test('existing v1 records gain an empty library without losing history', () => {
  const migrated = normalizeFoodState({ plans: [plan], logs: [log] })
  assert.deepEqual(migrated.plans, [plan])
  assert.deepEqual(migrated.logs, [log])
  assert.deepEqual(migrated.savedMeals, [])
  assert.equal(normalizeFoodState({ plans: [plan], logs: [log], savedMeals: null }), null)
})
test('reusing and changing a meal does not modify its saved source', () => {
  const meal = { id: 'saved-1', name: 'Lunch', food: 'Rice and beans', notes: 'Small portion' }
  const library = saveMeal(emptyFood, meal)
  const copy = copyMeal(meal, 'new-plan', '2026-10-13', '13:00')
  const planned = savePlan(library, { ...copy, food: 'Rice and vegetables' })
  assert.equal(planned.savedMeals[0].food, 'Rice and beans')
  assert.equal(planned.plans[0].id, 'new-plan')
  assert.equal(planned.plans[0].date, '2026-10-13')
  assert.equal(planned.logs.length, 0)
})
test('editing or removing a saved meal leaves copies and eating history intact', () => {
  const meal = { id: 'saved-1', name: 'Lunch', food: plan.food, notes: '' }
  const state = saveMeal(saveLog(savePlan(emptyFood, plan), log), meal)
  const edited = saveMeal(state, { ...meal, food: 'Soup' })
  assert.equal(edited.savedMeals.length, 1)
  const removed = removeMeal(edited, meal.id)
  assert.deepEqual(removed.plans, [plan])
  assert.deepEqual(removed.logs, [log])
  assert.deepEqual(removed.savedMeals, [])
  assert.equal(isFoodState(JSON.parse(JSON.stringify(edited))), true)
})
