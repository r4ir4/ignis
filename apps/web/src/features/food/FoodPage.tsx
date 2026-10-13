import { useEffect, useRef, useState } from 'react'
import { Button, Input, Textarea } from '@chakra-ui/react'
import { copyMeal, removeLog, removeMeal, removePlan, saveLog, saveMeal, savePlan, type FoodState, type MealLog, type MealPlan, type SavedMeal } from './foodModel'
import { Icon } from '../workspace/Icon'
type Draft = { id: string; name: string; time: string; food: string; notes: string; planId?: string }
export type FoodRequest = { planId: string; token: number }
const blank = (): Draft => ({ id: crypto.randomUUID(), name: '', time: new Date().toTimeString().slice(0, 5), food: '', notes: '' })
export function FoodPage({ data, date, onDateChange, commit, undo, canUndo, storageError, message, request }: { data: FoodState; date: string; onDateChange: (date: string) => void; commit: (data: FoodState, message: string) => void; undo: () => void; canUndo: boolean; storageError: string; message: string; request: FoodRequest | null }) {
  const [tab, setTab] = useState<'plan' | 'log' | 'saved'>('plan')
  const editorRef = useRef<HTMLDialogElement>(null)
  const closeEditor = () => { editorRef.current?.close(); setMode(null) }
  const [mode, setMode] = useState<'plan' | 'log' | 'saved' | null>(null)
  const [saveReusable, setSaveReusable] = useState(false)
  const [draft, setDraft] = useState<Draft>(blank)
  const plans = data.plans.filter(item => item.date === date).sort((a, b) => a.time.localeCompare(b.time))
  const logs = data.logs.filter(item => item.date === date).sort((a, b) => a.time.localeCompare(b.time))
  const nextMeal = plans.find(plan => !logs.some(log => log.planId === plan.id))
  useEffect(() => { if (mode && editorRef.current && !editorRef.current.open) editorRef.current.showModal() }, [mode])
  const open = (kind: 'plan' | 'log' | 'saved', item?: MealPlan | MealLog | SavedMeal) => { setTab(kind); setSaveReusable(false); setMode(kind); setDraft(item ? { ...blank(), ...item } : blank()) }
  const logPlan = (plan: MealPlan) => { setTab('log'); setSaveReusable(false); setMode('log'); setDraft({ ...plan, id: crypto.randomUUID(), planId: plan.id, time: new Date().toTimeString().slice(0, 5) }) }
  useEffect(() => {
    if (!request) return
    const plan = data.plans.find(item => item.id === request.planId)
    if (plan) logPlan(plan)
  }, [request])
  const savedMeals = [...data.savedMeals].sort((a, b) => a.name.localeCompare(b.name))
  const saveForReuse = (record: MealPlan | MealLog) => {
    if (data.savedMeals.some(meal => meal.name === record.name && meal.food === record.food && meal.notes === record.notes)) return
    commit(saveMeal(data, { id: crypto.randomUUID(), name: record.name, food: record.food, notes: record.notes }), 'Meal saved for reuse.')
  }
  const alreadySaved = (record: MealPlan | MealLog) => data.savedMeals.some(meal => meal.name === record.name && meal.food === record.food && meal.notes === record.notes)
  const reuse = (meal: SavedMeal, kind: 'plan' | 'log') => { setTab(kind); setSaveReusable(false); setMode(kind); setDraft(copyMeal(meal, crypto.randomUUID(), date, new Date().toTimeString().slice(0, 5))) }
  const submit = () => {
    if (!mode || !draft.name.trim() || !draft.food.trim() || (mode !== 'saved' && !draft.time)) return
    const record = { ...draft, name: draft.name.trim(), food: draft.food.trim(), notes: draft.notes.trim(), date }
    let next = mode === 'saved' ? saveMeal(data, { id: record.id, name: record.name, food: record.food, notes: record.notes }) : mode === 'plan' ? savePlan(data, record) : saveLog(data, record)
    if (mode !== 'saved' && saveReusable && !alreadySaved(record)) next = saveMeal(next, { id: crypto.randomUUID(), name: record.name, food: record.food, notes: record.notes })
    commit(next, mode === 'saved' ? 'Meal saved for reuse.' : mode === 'plan' ? 'Meal plan saved.' : 'What you ate has been logged.')
    closeEditor()
  }
  return <section className="food-page" aria-labelledby="food-heading">
    <div className="food-page-header"><div className="document-title"><h1 id="food-heading">Food</h1><span>Plan ahead. Log what you actually ate.</span></div><label className="food-date">Day<Input type="date" value={date} required onChange={event => { if (event.target.value) { onDateChange(event.target.value); closeEditor() } }} /></label></div>
    <p className="food-storage-note">Saved in this browser. Not synced to your other devices.</p>
    {storageError && <p className="food-error" role="alert">{storageError}</p>}
    <div className="food-feedback" role="status">{message && <span>{message}</span>}{canUndo && <button onClick={() => { undo(); closeEditor() }}>Undo last change</button>}</div>
    <div className="food-actions"><Button className="category-log" onClick={() => open('plan')}><Icon name="plus" size={16} />Plan a meal</Button><Button className="category-undo" onClick={() => open('log')}>Log what I ate</Button></div>
    {tab === 'plan' && nextMeal && <section className="food-next-meal" aria-labelledby="next-meal-heading"><div className="food-next-meta"><span>Next planned meal</span><span>{nextMeal.time}</span></div><h2 id="next-meal-heading">{nextMeal.name}</h2><p>{nextMeal.food}</p><Button className="category-log" onClick={() => logPlan(nextMeal)}>Log this meal</Button></section>}
    <div className="food-view-tabs" role="group" aria-label="Food views">
      <button aria-pressed={tab === 'plan'} onClick={() => setTab('plan')}>Meal plan <span>{plans.length}</span></button>
      <button aria-pressed={tab === 'log'} onClick={() => setTab('log')}>What I ate <span>{logs.length}</span></button>
      <button aria-pressed={tab === 'saved'} onClick={() => setTab('saved')}>Saved meals <span>{savedMeals.length}</span></button>
    </div>
    <section className="saved-meals-library" hidden={tab !== 'saved'} aria-label="Saved meals">
      <div className="saved-meals-heading"><p>Reuse a meal, then adjust it before saving.</p><Button className="category-undo" onClick={() => open('saved')}>New saved meal</Button></div>
      {savedMeals.length === 0 ? <p className="food-empty">Save a meal once to use it again in a plan or food log.</p> : <ul className="category-list">{savedMeals.map(meal => <li className="saved-meal-row" key={meal.id}><h3>{meal.name}</h3><p>{meal.food}</p>{meal.notes && <p className="food-record-note">{meal.notes}</p>}<div className="food-record-actions"><button onClick={() => reuse(meal, 'plan')} aria-label={`Plan ${meal.name}`}>Use in plan</button><button onClick={() => reuse(meal, 'log')} aria-label={`Log ${meal.name}`}>Use in log</button><details className="food-more-actions"><summary>More</summary><div><button onClick={() => open('saved', meal)} aria-label={`Edit saved meal ${meal.name}`}>Edit</button><button onClick={() => commit(removeMeal(data, meal.id), 'Saved meal removed. Plans and food logs were kept.')} aria-label={`Remove saved meal ${meal.name}`}>Remove</button></div></details></div></li>)}</ul>}
    </section>
    {mode && <dialog ref={editorRef} className="food-editor-dialog" aria-labelledby="food-editor-heading" onCancel={() => setMode(null)}><form className="food-editor" aria-label={mode === 'saved' ? 'Saved meal editor' : mode === 'plan' ? 'Meal plan editor' : 'Food log editor'} onSubmit={event => { event.preventDefault(); submit() }}>
      <div className="food-editor-heading"><h2 id="food-editor-heading">{mode === 'saved' ? 'Save a reusable meal' : mode === 'plan' ? 'Plan a meal' : 'What did you eat?'}</h2><button type="button" className="quiet-icon" aria-label="Close meal editor" onClick={closeEditor}><Icon name="close" size={18} /></button></div>
      {mode !== 'saved' && savedMeals.length > 0 && <div className="saved-meal-picker" key={draft.id}><label>Saved meal<select defaultValue="" onChange={event => { const meal = data.savedMeals.find(item => item.id === event.target.value); if (meal) setDraft(previous => ({ ...previous, name: meal.name, food: meal.food, notes: meal.notes })) }}><option value="" disabled>Choose a saved meal…</option>{savedMeals.map(meal => <option key={meal.id} value={meal.id}>{meal.name} — {meal.food.slice(0, 60)}</option>)}</select></label></div>}
      <div className={`food-form-row ${mode === 'saved' ? 'single-field' : ''}`}><label>Meal<Input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Breakfast, snack, or any meal" maxLength={80} required autoFocus /></label>{mode !== 'saved' && <label>{mode === 'plan' ? 'Planned time' : 'Time eaten'}<Input type="time" value={draft.time} onChange={event => setDraft({ ...draft, time: event.target.value })} required /></label>}</div>
      <label>{mode === 'saved' ? 'Food in this meal' : mode === 'plan' ? 'What is the plan?' : 'What you actually ate'}<Textarea value={draft.food} onChange={event => setDraft({ ...draft, food: event.target.value })} placeholder="For example: toast, eggs, and tea" required maxLength={2000} rows={2} /></label>
      {mode === 'log' && draft.planId && <p className="food-form-hint">Starts from your plan. Change the food or amount to match what you ate.</p>}
      <details><summary>Optional notes</summary><label>Notes<Textarea value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder="Preparation, portion, or anything to remember" maxLength={2000} rows={2} /></label></details>
      {mode !== 'saved' && <label className="save-meal-check"><input type="checkbox" checked={saveReusable} onChange={event => setSaveReusable(event.target.checked)} />Also save as a reusable meal</label>}
      <div className="food-actions"><Button className="category-log" type="submit" disabled={!draft.name.trim() || !draft.food.trim() || (mode !== 'saved' && !draft.time)}>{mode === 'saved' ? 'Save meal' : mode === 'plan' ? 'Save plan' : 'Save food log'}</Button><Button className="category-undo" type="button" onClick={closeEditor}>Cancel</Button></div>
    </form></dialog>}
    <section className="food-section" hidden={tab !== 'plan'} aria-labelledby="meal-plan-heading"><div className="agenda-heading"><h2 id="meal-plan-heading">Meal plan</h2><span>{plans.length} planned</span></div>
      {plans.length === 0 ? <p className="food-empty">No meals planned for this day. Start with your next meal; snacks count too.</p> : <ul className="category-list">{plans.map(plan => <li className="food-record" key={plan.id}><span className="agenda-time">{plan.time}</span><div><h3>{plan.name}</h3><p>{plan.food}</p>{plan.notes && <p className="food-record-note">{plan.notes}</p>}{logs.some(log => log.planId === plan.id) && <span className="category-status"><Icon name="check" size={14} />Food logged separately</span>}</div><div className="food-record-actions"><button onClick={() => logPlan(plan)}>Log meal</button><details className="food-more-actions"><summary>More</summary><div><button disabled={alreadySaved(plan)} onClick={() => saveForReuse(plan)}>{alreadySaved(plan) ? 'Saved for reuse' : 'Save for reuse'}</button><button onClick={() => open('plan', plan)} aria-label={`Edit plan for ${plan.name}`}>Edit</button><button onClick={() => commit(removePlan(data, plan.id), 'Plan removed. Food logs were kept.')} aria-label={`Remove plan for ${plan.name}`}>Remove</button></div></details></div></li>)}</ul>}
    </section>
    <section className="food-section" hidden={tab !== 'log'} aria-labelledby="food-log-heading"><div className="agenda-heading"><h2 id="food-log-heading">What I ate</h2><span>{logs.length} logged</span></div>
      {logs.length === 0 ? <p className="food-empty">Nothing logged for this day. You can log a planned meal or something different.</p> : <ul className="category-list">{logs.map(log => <li className="food-record" key={log.id}><span className="agenda-time">{log.time}</span><div><h3>{log.name}</h3><p>{log.food}</p>{log.notes && <p className="food-record-note">{log.notes}</p>}</div><div className="food-record-actions"><button onClick={() => open('log', log)} aria-label={`Edit food log for ${log.name}`}>Edit log</button><details className="food-more-actions"><summary>More</summary><div><button disabled={alreadySaved(log)} onClick={() => saveForReuse(log)}>{alreadySaved(log) ? 'Saved for reuse' : 'Save for reuse'}</button><button onClick={() => commit(removeLog(data, log.id), 'Food log removed.')} aria-label={`Remove food log for ${log.name}`}>Remove</button></div></details></div></li>)}</ul>}
    </section>
  </section>
}
