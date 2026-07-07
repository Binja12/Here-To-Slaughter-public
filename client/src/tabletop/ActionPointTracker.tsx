import React from 'react'
import Tooltip from './Tooltip'

// Three circular AP tokens + numeric counter. Token states:
// available (glowing gold) · spent (dim socket) · disabled (muted, not my turn).

type ActionPointTrackerProps = {
  current: number
  max: number
  disabled?: boolean
}

export default function ActionPointTracker({
  current,
  max,
  disabled = false,
}: ActionPointTrackerProps) {
  const tokens = Array.from({ length: max }, (_, i) => i < current)
  return (
    <div
      className="ap-tracker"
      role="status"
      aria-label={`${current} of ${max} action points remaining${disabled ? ' (not your turn)' : ''}`}
    >
      <span className="ap-count">
        {current}
        <span className="ap-count-sep">/</span>
        {max}
      </span>
      <span className="ap-label">Action Points</span>
      <span className="ap-tokens" aria-hidden="true">
        {tokens.map((available, i) => (
          <Tooltip
            key={i}
            text={
              disabled
                ? 'Action points refill on your turn'
                : available
                  ? 'Available — 1 action point'
                  : 'Spent this turn'
            }
          >
            <span
              className={`ap-token ${
                disabled ? 'ap-token-disabled' : available ? 'ap-token-available' : 'ap-token-spent'
              }`}
            />
          </Tooltip>
        ))}
      </span>
    </div>
  )
}
