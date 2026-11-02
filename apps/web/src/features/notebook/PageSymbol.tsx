import { IgnisFlame } from './IgnisFlame'
import { pageIcons, iconParts } from './pageSymbols'
export { pageIcons, pageEmojis, isPageEmoji, validPageSymbol } from './pageSymbols'

export function PageSymbol({ value }: { value: string }) {
  if (value.startsWith('emoji:')) return <span className="notebook-page-emoji" aria-hidden="true">{value.slice(6)}</span>
  const { id, color } = iconParts(value)
  const icon = pageIcons.find(item => id === item.id) || pageIcons[0]
  if (icon.id === 'flame') return color.value ? <span className="notebook-symbol-color" style={{ color: color.value }}><IgnisFlame /></span> : <IgnisFlame />
  return <svg width="20" height="20" viewBox={icon.viewBox || '0 0 24 24'} fill={icon.filled ? 'currentColor' : 'none'} stroke={icon.filled ? undefined : 'currentColor'} strokeWidth={icon.filled ? undefined : '1.7'} style={color.value ? { color: color.value } : undefined} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon.path} /></svg>
}
