import React from 'react'
import { ALL_CLASSES } from './model'
import { ClassIcon, classColor } from './icons'
import Tooltip from './Tooltip'

// Six class sockets in canonical order. Filled = represented in the local
// party; empty sockets stay desaturated. Names are in tooltips + aria labels
// so color is never the only signal.

export default function ClassIconRow({ owned }: { owned: Set<string> }) {
  return (
    <div className="class-row" role="list" aria-label="Party classes">
      {ALL_CLASSES.map((cls) => {
        const has = owned.has(cls)
        return (
          <Tooltip key={cls} text={`${cls} — ${has ? 'in your party' : 'missing'}`}>
            <span
              role="listitem"
              aria-label={`${cls}: ${has ? 'in party' : 'missing'}`}
              className={`class-socket ${has ? 'class-socket-owned' : ''}`}
              style={has ? { background: classColor(cls) } : undefined}
            >
              <ClassIcon
                heroClass={cls}
                size={15}
                color={has ? '#f5eeda' : '#57503f'}
              />
            </span>
          </Tooltip>
        )
      })}
    </div>
  )
}
