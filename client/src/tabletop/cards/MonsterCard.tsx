import React from 'react'
import CardFrame, { CardFrameProps } from './CardFrame'

// Face-up monster in the shared encounter row. `attackable` drives the amber
// affordance ring; the failure/slay thresholds render inside CardFrame.

type MonsterCardProps = CardFrameProps & {
  attackable?: boolean
  /** short flash when the local player launches an attack */
  underAttack?: boolean
}

export default function MonsterCard({
  attackable = false,
  underAttack = false,
  ...frame
}: MonsterCardProps) {
  return (
    <div className={`monster-slot ${underAttack ? 'monster-under-attack' : ''}`}>
      <CardFrame
        {...frame}
        size="lg"
        highlight={attackable ? 'attackable' : frame.highlight ?? 'none'}
      />
    </div>
  )
}
