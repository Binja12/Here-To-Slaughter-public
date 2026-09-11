import AssetImage from '../loading/AssetImage'
import React from 'react'
import type { PlayerView } from '../contract'
import { artFor } from './assets'
import { nameOf } from './seats'

/**
 * Cards the engine is SHOWING this seat right now — a look at a hand (Sharp
 * Fox), a revealed draw (Pan Chucks, Rex Major). They ride on
 * `view.revealedCards` for as long as the server's reveal clock runs (5 s),
 * then disappear on their own; nothing is asked, nothing is dimmed, and the
 * table stays playable underneath. A strip along the top of the stage, so it
 * never covers the hand or the HUD.
 *
 * It says WHOSE look it is, because a card on its own does not (the owner,
 * 2026-09-07): the seat the cards belong to when the reveal is a look at a
 * hand, otherwise the seat whose ability is showing them.
 */
export default function RevealedCards({ view }: { view: PlayerView }) {
  const cards = view.revealedCards ?? []
  if (cards.length === 0) return null
  const caption = view.revealedOf
    ? `${nameOf(view, view.revealedOf)}'s hand`
    : view.revealedBy
      ? `${nameOf(view, view.revealedBy)} revealed`
      : 'Revealed'
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[1.2cqh] z-[170] flex justify-center">
      <div className="flex items-end gap-[0.8cqw] rounded-[0.7cqw] border border-amber-300/60 bg-black/80 px-[1.2cqw] py-[0.8cqh] shadow-[0_0.4cqw_1.2cqw_rgba(0,0,0,0.85)]">
        <span className="mr-[0.5cqw] max-w-[16cqw] self-center truncate font-heading text-[1.5cqw] uppercase leading-tight tracking-[0.1cqw] text-amber-200 drop-shadow-[0_0.1cqw_0.2cqw_rgba(0,0,0,0.9)]">
          {caption}
        </span>
        {cards.map((card) => (
          <AssetImage
            key={card.id}
            src={artFor(card).url}
            alt={`${card.name}, ${card.type}`}
            draggable={false}
            className="h-[26cqh] select-none rounded-[0.4cqw] object-contain shadow-[0_0.3cqw_0.8cqw_rgba(0,0,0,0.8)]"
          />
        ))}
      </div>
    </div>
  )
}
