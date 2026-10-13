import { Box, Button, Checkbox, Flex, IconButton, Input, Textarea } from '@chakra-ui/react'
import { useEffect, useState } from 'react'
import { Calendar, previewToday } from '../features/workspace/Calendar'
import { initialTasks, noteSamples, type TaskGroup } from '../features/workspace/demo'
import { Icon, type IconName } from '../features/workspace/Icon'
import { DayOverview, sampleEntries } from '../features/workspace/DayOverview'
import { CategoryPage, categoryKinds, type CategoryName } from '../features/workspace/CategoryPage'
import { FlameDrawing } from '../features/workspace/FlameDrawing'
import { FoodPage, type FoodRequest } from '../features/food/FoodPage'
import { dateKey, foodDayEntries, removeLog } from '../features/food/foodModel'
import { useFood } from '../features/food/useFood'
import { MiniGarden } from '../features/garden/MiniGarden'
import { gardenGrowth, isDayEntry, isTask } from '../features/garden/gardenModel'
import { useStoredList } from '../features/garden/useStoredList'
import { CottagePlanner, FarmPanel } from '../features/garden/FarmPanel'
import type { FarmPlace } from '../features/garden/InteractiveFarm'
import './workspace.css'

const groups: { name: string; children: { name: string; icon?: IconName }[] }[] = [
  { name: 'Areas', children: [{ name: 'Personal' }, { name: 'Work' }] },
  { name: 'Notes', children: [{ name: 'Loose notes', icon: 'file' }, { name: 'Reading list', icon: 'book' }] },
  { name: 'Projects', children: [{ name: 'Ignis Farm' }] },
]
const taskGroups: TaskGroup[] = ['Priority', 'In progress', 'Later']

export function WorkspacePage() {
  const [gameMenu, setGameMenu] = useState(false)
  const [farmPanel, setFarmPanel] = useState<FarmPlace | null>(null)
  const openFarmPlace = (place: FarmPlace) => { setFoodRequest(null); setFarmPanel(place) }
  const closeFarmPanel = () => { setFarmPanel(null); setSelectedDate(previewToday) }
  const [sidebar, setSidebar] = useState(() => window.innerWidth >= 760)
  const [calendar, setCalendar] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [moreFolders, setMoreFolders] = useState(false)
  const [active, setActive] = useState('Tasks')
  const [selectedDate, setSelectedDate] = useState(previewToday)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ Areas: true, Notes: true, Projects: true })
  const [sections, setSections] = useState<Record<string, boolean>>({ Priority: true, 'In progress': true, Later: true })
  const food = useFood()
  const [foodRequest, setFoodRequest] = useState<FoodRequest | null>(null)
  const [dayEntries, setDayEntries, checkInStorageError] = useStoredList('ignis.checkins.v1', sampleEntries.filter(item => item.kind !== 'Food'), isDayEntry)
  const changeDayEntry = (id: string, done: boolean) => {
    if (id.startsWith('food-')) {
      const planId = id.slice(5)
      if (done) { setFoodRequest({ planId, token: Date.now() }); setFarmPanel('Food'); setCalendar(false) }
      else {
        const log = food.data.logs.filter(item => item.planId === planId && item.date === dateKey(selectedDate)).at(-1)
        if (log) food.commit(removeLog(food.data, log.id), 'Latest meal log undone.')
      }
      return
    }
    setDayEntries(previous => previous.map(item => item.id === id ? { ...item, done } : item))
  }
  const [tasks, setTasks, taskStorageError] = useStoredList('ignis.tasks.v1', initialTasks, isTask)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [drafts, setDrafts] = useState(noteSamples)
  useEffect(() => {
    const dismissPanels = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setGameMenu(false)
      if (window.innerWidth < 760) setSidebar(false)
      if (window.innerWidth < 1000) setCalendar(false)
    }
    window.addEventListener('keydown', dismissPanels)
    return () => window.removeEventListener('keydown', dismissPanels)
  }, [])
  const isToday = selectedDate.toDateString() === previewToday.toDateString()
  const visibleTasks = tasks.filter(task => task.title.toLowerCase().includes(search.toLowerCase()) && (searchOpen || !tasks.slice(0, 2).some(planned => planned.id === task.id)))
  const toggleSidebar = () => { setSidebar(!sidebar); if (window.innerWidth < 900) setCalendar(false) }
  const toggleCalendar = () => { setGameMenu(false); setCalendar(!calendar); if (window.innerWidth < 900) setSidebar(false) }
  const openSearch = (toggle = false) => { setActive('Tasks'); setSelectedDate(previewToday); setSearchOpen(toggle ? !searchOpen : true); if (window.innerWidth < 900) { setSidebar(false); setCalendar(false) } }
  const openNewTask = () => { setActive('Tasks'); setAdding(true); setSelectedDate(previewToday); if (window.innerWidth < 900) { setSidebar(false); setCalendar(false) } }
  const select = (name: string) => { setGameMenu(false); if (active === 'Tasks' && isToday && Object.hasOwn(categoryKinds, name)) { openFarmPlace(name as FarmPlace); return } setFoodRequest(null); setActive(name); setCalendar(false); setSearchOpen(false); setSearch(''); if (name === 'Tasks') setSelectedDate(previewToday); if (window.innerWidth < 760) setSidebar(false) }
  const addTask = () => { if (!title.trim()) return; setTasks(previous => [...previous, { id: Date.now(), title: title.trim(), group: 'Priority', done: false }]); setTitle(''); setAdding(false) }
  const iconButton = (label: string, icon: IconName, click: () => void, pressed?: boolean) => <IconButton className={`quiet-icon ${pressed ? 'active' : ''}`} aria-label={label} aria-pressed={pressed} onClick={click}><Icon name={icon} /></IconButton>
  return <Flex className={`workspace ${active === 'Tasks' && isToday && !searchOpen ? 'game-mode' : ''}`}>
    <header className="farm-header">
      <div className="farm-brand"><span className="wordmark">Ignis Farm</span><FlameDrawing /></div>
      <button className="mobile-menu-toggle" aria-label="Open navigation" aria-expanded={active === 'Tasks' && isToday && !searchOpen ? gameMenu : sidebar} aria-controls="workspace-navigation" onClick={() => active === 'Tasks' && isToday && !searchOpen ? setGameMenu(!gameMenu) : toggleSidebar()}><Icon name="panel" size={18} />Menu</button>
    </header>
    <Flex className="workspace-body">
    <Box as="nav" id="workspace-navigation" className={`folder-sidebar ${sidebar ? 'mobile-open' : ''} ${gameMenu ? 'game-menu-open' : ''}`} aria-label="Workspace navigation">
      <div className="folder-scroll">
        <div className="sidebar-heading"><button className="mobile-menu-close" aria-label="Close navigation" onClick={() => { setSidebar(false); setGameMenu(false) }}><Icon name="close" size={18} /></button></div>
        <button className={`tree-item primary-link ${active === 'Tasks' ? 'current' : ''}`} aria-current={active === 'Tasks' ? 'page' : undefined} onClick={() => select('Tasks')}><span>Today</span></button>
        {(Object.keys(categoryKinds) as CategoryName[]).map(name => <button key={name} className={`tree-item primary-link ${active === name ? 'current' : ''}`} aria-current={active === name ? 'page' : undefined} onClick={() => select(name)}><span>{name}</span></button>)}
        <button className={`tree-item primary-link ${active === 'Daily notes' ? 'current' : ''}`} aria-current={active === 'Daily notes' ? 'page' : undefined} onClick={() => select('Daily notes')}><span>Daily notes</span></button>
        <button className={`tree-item primary-link ${calendar ? 'panel-open' : ''}`} aria-pressed={calendar} onClick={toggleCalendar}><span>Calendar</span><Icon name="chevron" size={14} style={{ transform: calendar ? 'rotate(90deg)' : undefined }} /></button>
        <button className={`tree-item ${searchOpen ? 'current' : ''}`} aria-pressed={searchOpen} onClick={() => openSearch(true)}><Icon name="search" size={16} /><span>Search tasks</span></button>
        <div className="tree-divider" />
        <button className="tree-group-title" aria-expanded={moreFolders} aria-controls="extra-folders" onClick={() => setMoreFolders(!moreFolders)}><Icon name="chevron" size={13} style={{ transform: moreFolders ? 'rotate(90deg)' : undefined }} />More folders</button>
        {moreFolders && <div id="extra-folders">{groups.map(group => <div className="tree-group" key={group.name}><button className="tree-group-title" aria-expanded={expanded[group.name]} onClick={() => setExpanded(previous => ({ ...previous, [group.name]: !previous[group.name] }))}><Icon name="chevron" size={13} style={{ transform: expanded[group.name] ? 'rotate(90deg)' : undefined }} />{group.name}</button>{expanded[group.name] && <div className="tree-children">{group.children.map(item => <button key={item.name} className={`tree-item ${active === item.name ? 'current' : ''}`} onClick={() => select(item.name)}><Icon name={item.icon ?? 'folder'} size={15} /><span>{item.name}</span></button>)}</div>}</div>)}
        <button className={`tree-item archive ${active === 'Archive' ? 'current' : ''}`} onClick={() => select('Archive')}><Icon name="folder" size={15} /><span>Archive</span></button></div>}
      </div>
      <button className={`tree-item ${active === 'About' ? 'current' : ''}`} onClick={() => select('About')}><Icon name="book" size={16} /><span>About Ignis Farm</span></button>
    </Box>
    <Flex className="main-workspace" direction="column">
      <Flex className="document-and-calendar">
        <Box as="main" className="document-pane">
          <div className="reading-sheet">
          <div className="document-breadcrumb">Ignis Farm <span>/</span> {active === 'Tasks' ? 'Today' : active}</div>
          <div hidden={active !== 'Tasks'}>
            <div className="daily-heading">
              <div className="document-title"><h1>{isToday ? 'Your farm, your day.' : selectedDate.toLocaleDateString('en', { month: 'long', day: 'numeric' })}</h1></div>
              <time className="issue-date" dateTime={`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`}><span className="date-number">{selectedDate.getDate()}</span><span className="date-detail">{selectedDate.toLocaleDateString('en', { weekday: 'long' })}<br />{selectedDate.toLocaleDateString('en', { month: 'long', year: 'numeric' })}</span></time>
            </div>
            <div className="day-actions"><p className="document-intro">Your day in view. One thing at a time.</p><button className="quick-add" onClick={openNewTask}><Icon name="plus" size={16} />Add task</button></div>
            {searchOpen && <div className="task-search"><Icon name="search" size={17} /><Input aria-label="Search tasks" placeholder="Find a task…" value={search} onChange={event => setSearch(event.target.value)} autoFocus />{iconButton('Close search', 'close', () => { setSearchOpen(false); setSearch('') })}</div>}
            {adding && <form className="new-task" onSubmit={event => { event.preventDefault(); addTask() }}><Input aria-label="New task" placeholder="What needs your attention?" value={title} onChange={event => setTitle(event.target.value)} autoFocus /><Button type="submit" size="sm" className="add-task-button" disabled={!title.trim()}>Add task</Button>{iconButton('Cancel new task', 'close', () => setAdding(false))}</form>}
            <div hidden={!isToday || searchOpen}>
              <DayOverview garden={<MiniGarden date={selectedDate} onOpenPlace={openFarmPlace} growth={gardenGrowth(tasks, dayEntries, food.data.logs)} storageError={taskStorageError || checkInStorageError || food.storageError} />} tasks={tasks} extras={[...dayEntries, ...foodDayEntries(food.data, dateKey(selectedDate))]} onExtraChange={changeDayEntry} onTaskChange={(id, done) => setTasks(previous => previous.map(task => task.id === id ? { ...task, done } : task))} />
              <button className="list-toggle" aria-expanded={showAll} aria-controls="task-overview" onClick={() => setShowAll(!showAll)}><Icon name="chevron" size={16} style={{ transform: showAll ? 'rotate(90deg)' : undefined }} />{showAll ? 'Hide unscheduled tasks' : `Unscheduled tasks (${visibleTasks.length})`}</button>
            </div>
            <div id="task-overview">
            {isToday ? (showAll || searchOpen) && taskGroups.filter(group => visibleTasks.some(task => task.group === group)).map(group => <section className="task-section" key={group}><button className="section-heading" aria-expanded={sections[group]} onClick={() => setSections(previous => ({ ...previous, [group]: !previous[group] }))}><Icon name="chevron" size={13} style={{ transform: sections[group] ? 'rotate(90deg)' : undefined }} /><h2>{group}</h2><span>{visibleTasks.filter(task => task.group === group && !task.done).length}</span></button>{sections[group] && <div className="task-list">{visibleTasks.filter(task => task.group === group).map(task => <div key={task.id} className={`task-row ${task.done ? 'completed' : ''}`}><Checkbox.Root checked={task.done} onCheckedChange={details => setTasks(previous => previous.map(item => item.id === task.id ? { ...item, done: details.checked === true } : item))} className="task-checkbox"><Checkbox.HiddenInput aria-label={`Complete ${task.title}`} /><Checkbox.Control className="task-check-control"><Checkbox.Indicator><Icon name="check" size={12} /></Checkbox.Indicator></Checkbox.Control><Checkbox.Label className="task-copy">{task.title}</Checkbox.Label></Checkbox.Root></div>)}{!visibleTasks.some(task => task.group === group) && <p className="empty-section">{search ? 'No matching tasks' : 'Nothing here yet'}</p>}</div>}</section>) : <div className="day-empty"><Icon name="calendar" size={24} /><h2>A little breathing room</h2><p>No sample tasks for this day.</p><Button variant="plain" onClick={() => setSelectedDate(previewToday)}>Return to today</Button></div>}
            {isToday && searchOpen && visibleTasks.length === 0 && <p className="empty-section">No matching tasks.</p>}
            </div>
          </div>
          {active !== 'Tasks' && (active === 'Food' ? <FoodPage data={food.data} date={dateKey(selectedDate)} onDateChange={value => setSelectedDate(new Date(value + 'T12:00:00'))} commit={food.commit} undo={food.undo} canUndo={food.canUndo} storageError={food.storageError} message={food.message} request={foodRequest} /> : Object.hasOwn(categoryKinds, active) ? <CategoryPage name={active as CategoryName} entries={dayEntries} onChange={changeDayEntry} /> : active === 'About' ? <><div className="document-title"><h1>A place for your thoughts</h1></div><p className="document-intro">An early look at Ignis Farm.</p><div className="about-copy"><p>This is a local workspace prototype inspired by the reference you shared.</p><p>Explore the folders, check off a task, write a note, or choose a day on the calendar.</p><p>Tasks, check-ins, food and garden growth are saved in this browser. Notes are temporary. Your existing Raira data stays separate.</p></div></> : <><div className="document-title"><h1>{active}</h1><span>Sample note</span></div><Textarea className="note-editor" aria-label={`Edit ${active}`} value={drafts[active] ?? ''} onChange={event => setDrafts(previous => ({ ...previous, [active]: event.target.value }))} spellCheck={false} /></>)}
          </div>
        </Box>
        {calendar && <Box as="aside" className="calendar-sidebar" aria-label="Calendar"><Calendar selected={selectedDate} onSelect={date => { setSelectedDate(date); setActive('Tasks'); if (window.innerWidth < 1000) setCalendar(false) }} /></Box>}
      </Flex>
    </Flex>
    </Flex>
    {farmPanel && <FarmPanel title={farmPanel === 'cottage' ? 'Cottage · Daily plan' : farmPanel === 'Food' ? 'Kitchen · Food' : farmPanel === 'Exercises' ? 'Training yard · Exercises' : farmPanel === 'Habits' ? 'Garden · Habits' : 'Medicine cabinet · Meds'} onClose={closeFarmPanel}>
      {farmPanel === 'cottage' ? <CottagePlanner tasks={tasks} onChange={(id, done) => setTasks(previous => previous.map(task => task.id === id ? { ...task, done } : task))} onAdd={title => setTasks(previous => [...previous, { id: Date.now(), title, group: 'Priority', done: false }])} /> : farmPanel === 'Food' ? <FoodPage data={food.data} date={dateKey(selectedDate)} onDateChange={value => setSelectedDate(new Date(value + 'T12:00:00'))} commit={food.commit} undo={food.undo} canUndo={food.canUndo} storageError={food.storageError} message={food.message} request={foodRequest} /> : <CategoryPage name={farmPanel} entries={dayEntries} onChange={changeDayEntry} />}
    </FarmPanel>}
  </Flex>
}
