import { blockPalette, type BlockColor } from './blockPalette.ts'
export type NumberDisplay = { showAs: 'number' | 'bar' | 'ring'; color: BlockColor; divideBy: number; showNumber: boolean }
export const defaultNumberDisplay: NumberDisplay = { showAs: 'number', color: 'green', divideBy: 100, showNumber: true }
export function numberDisplay(config?: NumberDisplay | null): NumberDisplay { return { ...defaultNumberDisplay, ...config } }
export function validNumberDisplay(value: unknown): value is NumberDisplay | null | undefined {
  if (value == null) return true
  if (typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as NumberDisplay
  return Object.keys(v).every(key => ['showAs', 'color', 'divideBy', 'showNumber'].includes(key)) && ['number', 'bar', 'ring'].includes(v.showAs) && blockPalette.some(color => color.id !== 'default' && color.id === v.color) && typeof v.divideBy === 'number' && Number.isFinite(v.divideBy) && v.divideBy > 0 && v.divideBy <= 1e12 && typeof v.showNumber === 'boolean'
}
export function numberProgress(value: number, config?: NumberDisplay | null): number { return Math.max(0, Math.min(1, value / numberDisplay(config).divideBy)) }
export function numberText(value: number): string { return value !== 0 && Math.abs(value) < 1e-9 ? String(value) : value.toLocaleString(undefined, { maximumFractionDigits: 10 }) }
export function parsePropertyNumber(text: string, minimum = -1e12): number | null | undefined {
  if (!text.trim()) return null
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())) return undefined
  const number = Number(text)
  return Number.isFinite(number) && number >= minimum && number <= 1e12 ? number : undefined
}
