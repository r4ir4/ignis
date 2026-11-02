import { lazy, Suspense, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import WatchApp from './features/watch/WatchApp'
import './index.css'

const NotebookApp = lazy(() => import('./features/notebook/NotebookApp'))

const root = document.getElementById('root')
if (!root) throw new Error('The application root element is missing.')

const isWatch = location.hostname === 'watch.ignis.farm' || location.pathname === '/watch' || location.pathname.startsWith('/watch/')
createRoot(root).render(
  <StrictMode>
    {isWatch ? <WatchApp /> : <Suspense fallback={<p className="p-8" role="status">Opening your notebook…</p>}><NotebookApp /></Suspense>}
  </StrictMode>,
)
