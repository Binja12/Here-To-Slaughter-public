import React from 'react'
import { Availability } from './model'
import Tooltip from './Tooltip'

// Bottom-center action bar for the local player. Every control renders even
// when unavailable — disabled, with the reason in a tooltip — so players can
// always see what an action would cost and why it is blocked.

export type BarAction = {
  id: string
  label: string
  cost?: number
  avail: Availability
  emphasis?: 'gold' | 'plain'
  onTrigger: () => void
}

export default function ContextualActionBar({
  actions,
  hint,
}: {
  actions: BarAction[]
  hint?: string
}) {
  return (
    <div className="action-bar" role="toolbar" aria-label="Turn actions">
      {hint && <span className="action-bar-hint">{hint}</span>}
      <div className="action-bar-row">
        {actions.map((a) => (
          <Tooltip key={a.id} text={a.avail.enabled ? undefined : a.avail.reason}>
            <button
              className={`btn ${a.emphasis === 'gold' ? 'btn-gold' : ''} action-btn`}
              disabled={!a.avail.enabled}
              aria-disabled={!a.avail.enabled}
              aria-label={`${a.label}${a.cost ? `, costs ${a.cost} action point${a.cost > 1 ? 's' : ''}` : ''}${
                a.avail.enabled ? '' : `. Unavailable: ${a.avail.reason}`
              }`}
              onClick={a.onTrigger}
            >
              <span className="action-btn-label">{a.label}</span>
              {a.cost != null && a.cost > 0 && (
                <span className="action-btn-cost" aria-hidden="true">
                  {a.cost} AP
                </span>
              )}
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}
