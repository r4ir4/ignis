import { Box, Button, Flex, IconButton, Text } from '@chakra-ui/react'
import { useState } from 'react'
import { Icon } from './Icon'

export const previewToday = new Date(2026, 9, 12)
export function Calendar({ selected, onSelect }: { selected: Date; onSelect: (date: Date) => void }) {
  const [month, setMonth] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1))
  const start = new Date(month.getFullYear(), month.getMonth(), 1)
  const offset = (start.getDay() + 6) % 7
  const cells = Array.from({ length: 42 }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - offset + 1))
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const changeMonth = (direction: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + direction, 1))
  return <Box className="calendar">
    <Flex align="center" justify="space-between" mb="27px">
      <Text className="calendar-month">{month.toLocaleDateString('en', { month: 'short' })} <span>{month.getFullYear()}</span></Text>
      <Flex align="center" gap="1">
        <IconButton className="quiet-icon" aria-label="Previous month" onClick={() => changeMonth(-1)}><Icon name="chevron" size={15} style={{ transform: 'rotate(180deg)' }} /></IconButton>
        <Button className="calendar-today" variant="plain" onClick={() => { setMonth(new Date(previewToday.getFullYear(), previewToday.getMonth(), 1)); onSelect(previewToday) }}>Today</Button>
        <IconButton className="quiet-icon" aria-label="Next month" onClick={() => changeMonth(1)}><Icon name="chevron" size={15} /></IconButton>
      </Flex>
    </Flex>
    <div className="calendar-grid weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid days">{cells.map(date => {
      const current = date.getMonth() === month.getMonth()
      const marked = current && [12, 15, 19, 23].includes(date.getDate())
      return <button key={date.toISOString()} className={`calendar-day ${!current ? 'outside' : ''} ${sameDay(date, selected) ? 'selected' : ''} ${sameDay(date, previewToday) ? 'is-today' : ''}`} aria-label={date.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} aria-pressed={sameDay(date, selected)} onClick={() => { onSelect(date); if (!current) setMonth(new Date(date.getFullYear(), date.getMonth(), 1)) }}><span>{date.getDate()}</span>{marked && <i aria-hidden="true" />}</button>
    })}</div>
    <Box className="calendar-notes">
      <Text className="aside-label">On this day</Text>
      <Text className="aside-date">{selected.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
      <div className="calendar-note"><span /><div>A little room to think<p>Sample daily note</p></div></div>
    </Box>
  </Box>
}
