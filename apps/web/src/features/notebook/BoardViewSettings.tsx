import { NotebookChevron } from './NotebookChevron'
import { useState, useRef, useEffect, type ReactNode } from 'react'
import { BoardCardLayout } from './CardLayoutSettings'
import { CardPropertiesPicker } from './BoardCardProperties'
import { defaultCardProperties } from './cardProperties'
import { PropertyIcon } from './TaskPropertyControls'
import type { PersonalList } from './personalLists'
import type { ViewConfig } from './viewModel'

type Screen = 'main' | 'layout' | 'properties' | 'filter' | 'sort' | 'group'
export function BoardViewSettings({ config, list, change, close }: { config: ViewConfig; list?: PersonalList; change: (patch: Partial<ViewConfig>) => void; close: () => void }) {
  const [screen, setScreen] = useState<Screen>('main'), [copied, setCopied] = useState('')
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { if (screen !== 'main') (root.current?.querySelector<HTMLElement>('input') || root.current?.querySelector<HTMLElement>('[aria-label="Back to view settings"]'))?.focus(); else root.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus() }, [screen])
  const selected = config.cardProperties || defaultCardProperties
  const back = () => setScreen('main')
  const heading = (title: string) => <header>{screen !== 'main' && <button type="button" aria-label="Back to view settings" onClick={back}>←</button>}<strong>{title}</strong><button type="button" aria-label="Close view settings" onClick={close}>×</button></header>
  const row = (target: Screen, name: string, icon: string, value?: ReactNode) => <button type="button" role="menuitem" className="notebook-board-settings-row" onClick={() => setScreen(target)}><PropertyIcon type={icon} /><span>{name}</span><small>{value}</small><NotebookChevron direction="right" /></button>
  let body: ReactNode
  if (screen === 'layout') body = <BoardCardLayout config={config} list={list} change={change} close={close} back={back} />
  else if (screen === 'properties') body = <CardPropertiesPicker back={back} close={close} list={list} selected={selected} change={cardProperties => change({ cardProperties, ...(selected.includes('cover') !== cardProperties.includes('cover') ? { cardPreview: null } : {}) })} />
  else if (screen === 'main') body = <>{heading('View settings')}<div role="menu" aria-label="Board view settings">
    {row('layout', 'Layout', 'board', 'Board')}
    {row('properties', 'Property visibility', 'visibility', 1 + selected.filter(key => key !== 'cover' && (['date', 'value', 'status', 'description'].includes(key) || list?.properties?.some(property => property.id === key))).length)}
    {row('filter', 'Filter', 'filter', config.filter !== 'all' || config.query ? 'Active' : undefined)}
    {row('sort', 'Sort', 'sort', config.sort === 'manual' ? undefined : config.sort === 'title' ? 'Name' : 'Date')}
    {row('group', 'Group', 'board', config.group === 'status' ? 'Status' : 'Date')}
    <div className="notebook-board-settings-divider" /><button type="button" role="menuitem" className="notebook-board-settings-row" onClick={() => { void navigator.clipboard.writeText(window.location.href).then(() => setCopied('Link copied')).catch(() => setCopied('Unable to copy link')) }}><PropertyIcon type="url" /><span>{copied || 'Copy link to view'}</span></button>
  </div></>
  else if (screen === 'filter') body = <>{heading('Filter')}<div className="notebook-board-settings-search"><input aria-label="Search board tasks" placeholder="Search tasks…" maxLength={200} value={config.query} onChange={event => change({ query: event.target.value })} /></div><div role="menu" aria-label="Filter tasks">{([{ value: 'all', name: 'All tasks' }, { value: 'open', name: 'Open tasks' }, { value: 'done', name: 'Completed tasks' }] as const).map(option => <button type="button" key={option.value} role="menuitemradio" aria-checked={config.filter === option.value} className="notebook-board-settings-row" onClick={() => change({ filter: option.value })}><span>{option.name}</span>{config.filter === option.value && <i>✓</i>}</button>)}</div>{(config.query || config.filter !== 'all') && <button type="button" className="notebook-board-settings-reset" onClick={() => change({ query: '', filter: 'all' })}>Reset filters</button>}</>
  else if (screen === 'sort') body = <>{heading('Sort')}<div role="menu" aria-label="Sort tasks">{([{ value: 'manual', name: 'Manual order' }, { value: 'title', name: 'Name · Ascending' }, { value: 'date', name: 'Date · Ascending' }] as const).map(option => <button type="button" key={option.value} role="menuitemradio" aria-checked={config.sort === option.value} className="notebook-board-settings-row" onClick={() => change({ sort: option.value })}><PropertyIcon type={option.value === 'date' ? 'date' : 'sort'} /><span>{option.name}</span>{config.sort === option.value && <i>✓</i>}</button>)}</div></>
  else body = <>{heading('Group')}<div role="menu" aria-label="Group tasks">{([{ value: 'status', name: 'Status' }, { value: 'day', name: 'Date' }] as const).map(option => <button type="button" key={option.value} role="menuitemradio" aria-checked={config.group === option.value} className="notebook-board-settings-row" onClick={() => change({ group: option.value })}><PropertyIcon type={option.value === 'day' ? 'date' : option.value} /><span>{option.name}</span>{config.group === option.value && <i>✓</i>}</button>)}</div><div className="notebook-board-settings-divider" /><label className="notebook-board-layout-row"><span>Show item counts</span><button type="button" role="switch" aria-label="Show item counts" aria-checked={!config.hideAggregation} onClick={() => change({ hideAggregation: !config.hideAggregation })}><span /></button></label></>
  return <div ref={root} className="notebook-board-view-settings" onKeyDown={event => { if (event.altKey || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || (event.target as HTMLElement).tagName === 'INPUT' || screen === 'properties' || screen === 'layout') return; const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"]')]; if (!options.length) return; event.preventDefault(); const index = options.indexOf(event.target as HTMLButtonElement); options[event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : index < 0 ? event.key === 'ArrowDown' ? 0 : options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length].focus() }}>{body}</div>
}
