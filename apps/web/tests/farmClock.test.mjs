import test from 'node:test'
import assert from 'node:assert/strict'
import { farmLighting, farmTimeZone } from '../src/features/garden/farmClock.ts'
const at = utc => farmLighting(new Date(`2026-10-12T${utc}:00Z`))
test('scene follows Bahia time rather than the host timezone', () => {
  assert.equal(farmTimeZone, 'America/Bahia')
  assert.equal(at('08:30').label, '05:30')
  assert.equal(at('08:30').phase, 'Dawn')
  assert.equal(at('15:00').phase, 'Day')
  assert.equal(at('20:00').phase, 'Golden hour')
  assert.equal(at('21:30').phase, 'Dusk')
  assert.equal(at('02:00').label, '23:00')
  assert.equal(at('02:00').phase, 'Night')
})
test('phase boundaries and midnight stay valid', () => {
  assert.equal(at('07:59').phase, 'Night')
  assert.equal(at('08:00').phase, 'Dawn')
  assert.equal(at('10:00').phase, 'Day')
  assert.equal(at('19:00').phase, 'Golden hour')
  assert.equal(at('21:00').phase, 'Dusk')
  assert.equal(at('22:00').phase, 'Night')
  assert.equal(at('03:00').label, '00:00')
})
test('sun rises, reaches a higher midday position, and changes brightness late', () => {
  const dawn = at('08:30'), noon = at('15:00'), sunset = at('20:30')
  assert.ok(dawn.sunX < noon.sunX && noon.sunX < sunset.sunX)
  assert.ok(noon.sunY < dawn.sunY)
  assert.notEqual(noon.sunColor, sunset.sunColor)
  assert.equal(at('02:00').dark, true)
  assert.equal(noon.opacity, 0)
})
