import React from 'react'
import { CardData } from '../types'
import CardFrame from './cards/CardFrame'
import Tooltip from './Tooltip'

// Dimensional deck/discard pile: stacked edge layers + count badge.

type CardStackProps = {
  label: string
  count: number
  /** face-up top card (discard pile) */
  topCard?: CardData
  tooltip?: string
  onActivate?: () => void
  onInspect?: (card: CardData | null, e?: React.SyntheticEvent) => void
  disabledReason?: string
}

export default function CardStack({
  label,
  count,
  topCard,
  tooltip,
  onActivate,
  onInspect,
  disabledReason,
}: CardStackProps) {
  const depth = count === 0 ? 0 : count < 4 ? 1 : count < 12 ? 2 : 3
  const stack = (
    <div
      className={`stack ${onActivate ? 'stack-interactive' : ''} ${count === 0 ? 'stack-empty' : ''}`}
      role={onActivate ? 'button' : undefined}
      tabIndex={onActivate ? 0 : undefined}
      aria-label={`${label}, ${count} card${count === 1 ? '' : 's'}${disabledReason ? `. ${disabledReason}` : ''}`}
      onClick={onActivate}
      onKeyDown={
        onActivate
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onActivate()
              }
            }
          : undefined
      }
    >
      <span className="zone-caption">{label}</span>
      <div className={`stack-pile stack-depth-${depth}`}>
        {count === 0 ? (
          <div className="stack-outline" />
        ) : topCard ? (
          <CardFrame card={topCard} size="sm" onInspect={onInspect} />
        ) : (
          <CardFrame faceDown size="sm" />
        )}
        <span className="stack-count" aria-hidden="true">
          {count}
        </span>
      </div>
    </div>
  )

  const tip = disabledReason ?? tooltip
  return tip ? <Tooltip text={tip}>{stack}</Tooltip> : stack
}
