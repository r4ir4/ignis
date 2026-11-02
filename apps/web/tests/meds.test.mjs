import test from 'node:test'
import assert from 'node:assert/strict'
import { doseRows, median, duration, wallInput, wallISO, medDay } from '../src/features/notebook/medsModel.ts'

test('Meds calculates observed duration across midnight and keeps absent check-ins unknown', () => {
  const data = { timezone: 'America/Bahia', doses: [{ id: 1, taken_at: '2026-10-18T22:00:00Z', dose_mg: 30 }, { id: 2, taken_at: '2026-10-19T12:00:00Z', dose_mg: 30 }], events: [{ dose_id: 1, event_type: 'onset', occurred_at: '2026-10-18T23:00:00Z' }, { dose_id: 1, event_type: 'strongest', occurred_at: '2026-10-19T01:00:00Z' }, { dose_id: 1, event_type: 'wearing_off', occurred_at: '2026-10-19T04:30:00Z' }] }
  const rows = doseRows(data)
  assert.equal(rows[0].onset, 60)
  assert.equal(rows[0].peak, 180)
  assert.equal(rows[0].effect, 330)
  assert.equal(rows[1].effect, null)
  assert.equal(median(rows.map(row => row.effect)), 330)
  assert.equal(duration(rows[0].effect), '5h 30m')
  assert.equal(duration(null), '—')
  assert.equal(median([null]), null)
  assert.equal(median([40, 10, null, 20, 30]), 25)
})

test('Meds never counts impossible legacy phase sequences as measured duration', () => {
  const data = { timezone: 'America/Bahia', doses: [{ id: 1, taken_at: '2026-10-18T12:00:00Z', dose_mg: 30 }], events: [{ dose_id: 1, event_type: 'onset', occurred_at: '2026-10-18T11:00:00Z' }, { dose_id: 1, event_type: 'wearing_off', occurred_at: '2026-10-18T10:00:00Z' }] }
  assert.equal(doseRows(data)[0].effect, null)
  assert.equal(doseRows(data)[0].onset, null)
  data.events[0].occurred_at = '2026-10-20T13:00:00Z'
  assert.equal(doseRows(data)[0].onset, null)
})

test('Meds edits times in the Raira timezone rather than the browser timezone', () => {
  assert.equal(wallInput('2026-10-19T01:00:00Z', 'America/Sao_Paulo'), '2026-10-18T22:00')
  assert.equal(wallISO('2026-10-18T22:00', 'America/Sao_Paulo'), '2026-10-19T01:00:00.000Z')
  assert.equal(medDay('2026-10-19T01:00:00Z', 'America/Sao_Paulo'), '2026-10-18')
  assert.equal(wallISO('2026-07-10T12:30', 'America/New_York'), '2026-07-10T16:30:00.000Z')
  assert.throws(() => wallISO('2026-03-08T02:30', 'America/New_York'))
  assert.throws(() => wallISO('', 'America/Bahia'))
})

test('Timeline scale fits all observations and labels relative hours from zero', async () => {
  const { timelineScale } = await import('../src/features/notebook/medsModel.ts')
  for (const relative of [true, false]) {
    for (const values of [[], [6.1, 8.5, 13.2], [23.8, 27.4], [5, 54.2]]) {
      const scale = timelineScale(values, relative)
      assert.ok(scale.end > scale.start)
      assert.ok(values.every(value => value >= scale.start && value <= scale.end))
      assert.equal(scale.ticks[0], scale.start)
      assert.equal(scale.ticks.at(-1), scale.end)
      if (relative) assert.equal(scale.start, 0)
    }
  }
})
