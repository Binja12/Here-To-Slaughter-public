import React from 'react'
import Card from '../Card'
import { CardData } from '../../types'
import './board.css'

/**
 * A deck or discard pile with a label plate and count badge. Face-down decks
 * render a stacked card back; discard shows its top card face-up.
 */
export default function DeckPile(props: {
  label: string
  count: number
  topCard?: CardData
  size?: 'sm' | 'md'
  onClick?: () => void
  onHoverChange?: (card: CardData | null, e?: React.MouseEvent) => void
  title?: string
}) {
  const { label, count, topCard, size = 'sm' } = props
  return (
    <div className="deck-pile">
      <div className="pile-plate">{label}</div>
      <div className={`pile-stack ${count > 1 ? 'pile-stack-deep' : ''}`}>
        {topCard ? (
          <Card
            card={topCard}
            size={size}
            onClick={props.onClick}
            onHoverChange={props.onHoverChange}
            title={props.title}
          />
        ) : count > 0 ? (
          <Card faceDown size={size} onClick={props.onClick} title={props.title} />
        ) : (
          <div className={`empty-slot empty-${size}`} />
        )}
      </div>
      <div className="pile-badge">{count}</div>
    </div>
  )
}
