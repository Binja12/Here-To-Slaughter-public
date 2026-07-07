import React from 'react'
import CardFrame, { CardFrameProps } from './CardFrame'

// Party Leader — framed slightly larger than party heroes, with a plaque.

export default function PartyLeaderCard(props: CardFrameProps) {
  return (
    <div className="leader-slot">
      <span className="zone-caption">Party Leader</span>
      <CardFrame {...props} />
    </div>
  )
}
