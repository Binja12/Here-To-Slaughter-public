import React from 'react'
import { CardData } from '../../types'
import { ClassIcon, SkullIcon, classColor } from '../icons'

// Original, procedurally-themed placeholder art. Each card gets a stable
// palette derived from its name so the same card always looks the same,
// with a class/type motif as the centerpiece. No copyrighted assets.

function hashOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const TYPE_HUES: Record<string, number> = {
  Hero: 205,
  Leader: 268,
  Monster: 130,
  Item: 35,
  Magic: 285,
  Modifier: 200,
  Challenge: 8,
}

function TypeMotif({ card, color }: { card: CardData; color: string }) {
  switch (card.type) {
    case 'Hero':
    case 'Leader':
      return <ClassIcon heroClass={card.heroClass} size={46} color={color} />
    case 'Monster':
      return <SkullIcon size={48} color={color} />
    case 'Item':
      return (
        <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2l3 3-1.5 1.5L15 8l4 4-2 2-4-4-1.5 1.5L10 10 7 13l-3-3 8-8z"
            fill={color}
          />
          <circle cx="6" cy="18" r="3" stroke={color} strokeWidth="2" fill="none" />
        </svg>
      )
    case 'Magic':
      return (
        <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2l1.8 4.6L18 8.4l-4.2 1.8L12 15l-1.8-4.8L6 8.4l4.2-1.8L12 2z" fill={color} />
          <path d="M18 13l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5z" fill={color} opacity="0.8" />
        </svg>
      )
    case 'Modifier':
      return (
        <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z" fill={color} />
        </svg>
      )
    case 'Challenge':
      return (
        <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4l6 8-6 8h3l6-8-6-8H4zM13 4l6 8-6 8h3l6-8-6-8h-3z" fill={color} />
        </svg>
      )
    default:
      return null
  }
}

export default function CardArt({ card }: { card: CardData }) {
  const h = hashOf(card.name)
  const baseHue = TYPE_HUES[card.type] ?? 220
  const spread = card.type === 'Monster' ? 130 : 40
  const hue = (baseHue + (h % spread) - spread / 2 + 360) % 360
  const motifColor =
    card.type === 'Hero' || card.type === 'Leader'
      ? '#f0e6d2'
      : `hsl(${hue}, 45%, 78%)`
  const badgeColor =
    card.type === 'Hero' || card.type === 'Leader'
      ? classColor(card.heroClass)
      : `hsl(${hue}, 40%, 30%)`

  return (
    <div
      className="card-art"
      style={{
        background: `
          radial-gradient(ellipse 90% 55% at 50% 108%, hsla(${hue}, 35%, 8%, 0.9), transparent),
          radial-gradient(ellipse 80% 70% at 50% 30%, hsl(${hue}, 42%, ${26 + (h % 8)}%), hsl(${hue}, 48%, 12%))`,
      }}
    >
      <span className="card-art-glow" style={{ background: badgeColor }} />
      <span className="card-art-motif">
        <TypeMotif card={card} color={motifColor} />
      </span>
      <span
        className="card-art-specks"
        style={{
          backgroundImage: `radial-gradient(circle 1px at ${20 + (h % 50)}% ${15 + (h % 30)}%, #ffffff88 40%, transparent 60%),
            radial-gradient(circle 1px at ${60 + (h % 30)}% ${50 + (h % 25)}%, #ffffff55 40%, transparent 60%),
            radial-gradient(circle 1px at ${10 + (h % 70)}% ${60 + (h % 20)}%, #ffffff44 40%, transparent 60%)`,
        }}
      />
    </div>
  )
}
