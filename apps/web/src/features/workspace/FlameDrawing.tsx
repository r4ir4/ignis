import { useState } from 'react'

/** Original pen-style brand drawing, separate from the interface icon set. */
export function FlameDrawing() {
  const [paused, setPaused] = useState(false)
  return <button className={`brand-flame-toggle ${paused ? 'is-paused' : ''}`} aria-label={paused ? 'Resume flame animation' : 'Pause flame animation'} title={paused ? 'Resume animation' : 'Pause animation'} onClick={() => setPaused(!paused)}><svg className="brand-flame" viewBox="0 0 64 76" fill="none" aria-hidden="true" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <g className="flame-sway">
    <path fill="currentColor" strokeWidth="2.5" d="M34 5c4 12-6 19-2 27 3-2 6-7 6-13 12 10 21 21 17 35-3 12-14 18-26 16C14 69 7 59 9 47c1-8 7-15 13-21-1 8-1 13 3 16 0-12 13-24 9-37Z" />
    <path className="flame-core" fill="var(--paper)" stroke="var(--paper)" strokeWidth="1.8" d="M31 43c3 7-4 11-3 17 5 3 11-1 12-6 1-4-2-9-5-12 1 5 0 8-3 10" />
    <path stroke="var(--paper)" opacity=".45" strokeWidth=".9" d="M33 9c1 9-5 15-4 21M43 31c7 8 11 16 8 25M12 48c-1 8 2 15 9 19M24 70c7 2 15 1 20-3" />
    <path stroke="var(--paper)" opacity=".45" strokeWidth="1.1" d="m15 49 3 2m-3 3 3 2m-1 3 3 2m23-16 3-2m-2 7 3-2" />
    </g>
  </svg></button>
}
