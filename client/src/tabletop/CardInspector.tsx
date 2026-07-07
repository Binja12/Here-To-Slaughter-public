import React from 'react'
import { CardData } from '../types'
import CardFrame from './cards/CardFrame'

// Docked large-format reader for whichever card is hovered or focused.
// A fixed dock (rather than a cursor-chasing popup) keeps the board calm and
// stays useful for keyboard users.

export default function CardInspector({ card }: { card: CardData | null }) {
  return (
    <aside className={`inspector ${card ? 'inspector-open' : ''}`} aria-live="polite">
      {card && (
        <>
          <CardFrame card={card} size="xl" />
          {card.type === 'Monster' && (
            <p className="inspector-note">
              Attacking costs 2 action points and rolls against the thresholds
              shown. Meet the party requirement first.
            </p>
          )}
          {card.type === 'Modifier' && (
            <p className="inspector-note">
              Played as a reaction while a roll is being resolved — costs no
              action points.
            </p>
          )}
        </>
      )}
    </aside>
  )
}
