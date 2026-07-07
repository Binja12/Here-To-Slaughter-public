import React from 'react'
import { CardData } from '../../types'
import { ClassIcon, classColor } from '../icons'
import CardArt from './CardArt'

export type CardHighlight = 'none' | 'playable' | 'target' | 'attackable'

export type CardFrameProps = {
  card?: CardData
  /** xs = opponent rows · sm = party rows · md = leaders · lg = monsters · xl = inspector */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  faceDown?: boolean
  selected?: boolean
  exhausted?: boolean
  highlight?: CardHighlight
  ariaLabel?: string
  /** click / Enter / Space */
  onActivate?: () => void
  onInspect?: (card: CardData | null, e?: React.SyntheticEvent) => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}

/** Requirement icon strip shared by monster face + inspector. */
export function ReqIcons({ classes, size = 15 }: { classes: string[]; size?: number }) {
  return (
    <span className="req-icons">
      {classes.map((c, i) => (
        <span key={i} className="req-icon" title={c === 'Any' ? 'Any hero' : c}>
          <ClassIcon heroClass={c === 'Any' ? undefined : c} size={size} />
        </span>
      ))}
    </span>
  )
}

export default function CardFrame({
  card,
  size = 'sm',
  faceDown = false,
  selected = false,
  exhausted = false,
  highlight = 'none',
  ariaLabel,
  onActivate,
  onInspect,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
}: CardFrameProps) {
  if (faceDown || !card) {
    return (
      <div className={`cardf cardf-${size} cardf-back`} aria-label={ariaLabel ?? 'Face-down card'}>
        <span className="cardf-back-emblem">⚔</span>
        <span className="cardf-back-title">HERE TO SLAUGHTER</span>
      </div>
    )
  }

  const interactive = !!onActivate || draggable
  const classes = [
    'cardf',
    `cardf-${size}`,
    `cardf-type-${card.type.toLowerCase()}`,
    selected ? 'cardf-selected' : '',
    exhausted ? 'cardf-exhausted' : '',
    highlight !== 'none' ? `cardf-hl-${highlight}` : '',
    interactive ? 'cardf-interactive' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const isCharacter = card.type === 'Hero' || card.type === 'Leader'
  const isMonster = card.type === 'Monster'
  const lowToWin = card.rollCompareMode === 'LowToWin'

  return (
    <div
      className={classes}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={ariaLabel ?? `${card.name}, ${card.type}`}
      aria-pressed={interactive ? selected : undefined}
      onClick={
        onActivate
          ? (e) => {
              e.stopPropagation()
              onActivate()
            }
          : undefined
      }
      onKeyDown={
        onActivate
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onActivate()
              }
            }
          : undefined
      }
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseEnter={onInspect ? (e) => onInspect(card, e) : undefined}
      onMouseLeave={onInspect ? () => onInspect(null) : undefined}
      onFocus={onInspect ? (e) => onInspect(card, e) : undefined}
      onBlur={onInspect ? () => onInspect(null) : undefined}
    >
      <header className="cardf-head">
        <span className="cardf-name">{card.name}</span>
        <span className="cardf-typeline">
          {isCharacter && card.heroClass ? `${card.type} · ${card.heroClass}` : card.type}
        </span>
      </header>

      <CardArt card={card} />

      {isCharacter && card.heroClass && (
        <span
          className="cardf-class-gem"
          style={{ background: classColor(card.heroClass) }}
          title={card.heroClass}
        >
          <ClassIcon heroClass={card.heroClass} size={13} color="#f5eeda" />
        </span>
      )}

      <footer className="cardf-body">
        {card.type === 'Hero' && card.rollReq != null && (
          <span className="cardf-roll-badge" title={`Effect triggers on a roll of ${card.rollReq} or higher`}>
            {card.rollReq}+
          </span>
        )}
        <span className="cardf-desc">{card.description}</span>
      </footer>

      {isMonster && (
        <div className="cardf-monster-bar">
          <span className="cardf-monster-req">
            <span className="cardf-monster-req-label">Requires</span>
            <ReqIcons classes={card.partyReq?.classes ?? []} />
            <span className="cardf-monster-req-label">to attack</span>
          </span>
          <span className="cardf-monster-badges">
            {card.lowerReq != null && (
              <span
                className="cardf-threshold cardf-threshold-bad"
                title={`Rolling ${card.lowerReq}${lowToWin ? ' or higher' : ' or lower'}: the monster strikes back`}
              >
                {card.lowerReq}
                {lowToWin ? '+' : '−'}
              </span>
            )}
            {card.higherReq != null && (
              <span
                className="cardf-threshold cardf-threshold-slay"
                title={`Roll ${card.higherReq}${lowToWin ? ' or lower' : ' or higher'} to slay`}
              >
                {card.higherReq}
                {lowToWin ? '−' : '+'}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
