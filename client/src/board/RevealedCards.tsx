import React from 'react'
import type { CardView } from '../contract'
import { artFor } from './assets'

/**
 * Cards the engine is SHOWING this seat right now — a look at a hand (Sharp
 * Fox), a revealed draw (Pan Chucks, Rex Major). They ride on
 * `view.revealedCards` for as long as the server's reveal clock runs (5 s),
 * then disappear on their own; nothing is asked, nothing is dimmed, and the
 * table stays playable underneath. A strip along the top of the stage, so it
 * never covers the hand or the HUD.
 */
export default function RevealedCards({ cards }: { cards: CardView[] }) {
  if (cards.length === 0) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[1.2cqh] z-[170] flex justify-center">
      <div className="flex items-end gap-[0.6cqw] rounded-[0.6cqw] border border-amber-300/60 bg-black/70 px-[0.9cqw] py-[0.6cqh] shadow-[0_0.4cqw_1.2cqw_rgba(0,0,0,0.8)]">
        <span className="mr-[0.4cqw] self-center font-heading text-[0.8cqw] uppercase tracking-widest text-amber-200">
          Revealed
        </span>
        {cards.map((card) => (
          <img
            key={card.id}
            src={artFor(card).url}
            alt={`${card.name}, ${card.type}`}
            draggable={false}
            className="h-[16cqh] select-none rounded-[0.4cqw] object-contain shadow-[0_0.3cqw_0.8cqw_rgba(0,0,0,0.8)]"
          />
        ))}
      </div>
    </div>
  )
}
