import React from 'react'
import { CardData } from '../types'
import './Card.css'

// No text overlays — the card template art already contains name, description
// and stats. UI only adds interaction states (glow, exhausted, face-down).

type CardProps = {
  card?: CardData
  /** xs = opponent zones, sm = compact piles, md = board/hand */
  size?: 'xs' | 'sm' | 'md'
  faceDown?: boolean
  /** grayed out (e.g. hero ability already used this turn) */
  exhausted?: boolean
  glowing?: boolean
  draggable?: boolean
  onClick?: () => void
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onHoverChange?: (card: CardData | null, e?: React.MouseEvent) => void
  title?: string
}

export function cardTemplate(type: string): string {
  return `/cards/${type.toLowerCase()}.png`
}

export default function Card({
  card,
  size = 'md',
  faceDown = false,
  exhausted = false,
  glowing = false,
  draggable = false,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
  onHoverChange,
  title,
}: CardProps) {
  if (faceDown || !card) {
    return (
      <div className={`card card-${size} card-back`} onClick={onClick} title={title}>
        <span className="card-back-logo">HTS</span>
      </div>
    )
  }

  const classes = [
    'card',
    `card-${size}`,
    exhausted ? 'card-exhausted' : '',
    glowing ? 'card-glowing' : '',
    onClick || draggable ? 'card-interactive' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      style={{ backgroundImage: `url(${cardTemplate(card.type)})` }}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseEnter={(e) => onHoverChange?.(card, e)}
      onMouseLeave={() => onHoverChange?.(null)}
      title={title}
    />
  )
}
