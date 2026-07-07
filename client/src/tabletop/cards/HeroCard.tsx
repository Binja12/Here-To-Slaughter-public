import React from 'react'
import { CardData } from '../../types'
import CardFrame, { CardFrameProps } from './CardFrame'

// A hero in a party, with its equipped item tucked underneath.

type HeroCardProps = Omit<CardFrameProps, 'card'> & {
  card?: CardData
  equippedItem?: CardData
  /** true once the hero effect has been used this turn */
  usedThisTurn?: boolean
}

export default function HeroCard({
  equippedItem,
  usedThisTurn = false,
  ...frame
}: HeroCardProps) {
  return (
    <div className="hero-slot">
      <CardFrame {...frame} exhausted={usedThisTurn || frame.exhausted} />
      {usedThisTurn && (
        <span className="hero-used-chip" title="Hero effect already used this turn">
          used
        </span>
      )}
      {equippedItem && (
        <div className="hero-equip-tuck" title={`Equipped: ${equippedItem.name}`}>
          <CardFrame card={equippedItem} size="xs" onInspect={frame.onInspect} />
        </div>
      )}
    </div>
  )
}
