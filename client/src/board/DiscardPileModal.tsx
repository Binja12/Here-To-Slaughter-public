import React, { useEffect, useState } from 'react'
import { CardType, CardView } from '../contract'
import { artFor } from './assets'
import { tkey, useTargetable } from './targeting'

const DISCARD_TYPES: CardType[] = [
  'Hero',
  'Item',
  'Magic',
  'Modifier',
  'Challenge',
]

type Filter = 'All' | CardType

function DiscardCard({
  card,
  index,
  top,
  onPicked,
}: {
  card: CardView
  index: number
  top: boolean
  onPicked: () => void
}) {
  const target = useTargetable(tkey.discardCard(index))

  return (
    <article
      className={`relative min-w-0 rounded-[0.4cqw] ${target.className}`}
      onClick={(event) => {
        target.onClick(event)
        if (target.mode === 'target') onPicked()
      }}
    >
      <img
        src={artFor(card).url}
        alt={`${card.name}, ${card.type}`}
        draggable={false}
        className="aspect-[3/4] w-full select-none rounded-[0.4cqw] object-contain shadow-[0_0.35cqw_0.8cqw_rgba(0,0,0,0.8)]"
      />
      {top && (
        <span className="absolute -right-[0.3cqw] -top-[0.45cqh] rounded-full border border-amber-200 bg-amber-700 px-[0.42cqw] py-[0.12cqh] font-heading text-[0.48cqw] uppercase tracking-wide text-white shadow-lg">
          Top
        </span>
      )}
    </article>
  )
}

export default function DiscardPileModal({
  cards,
  onClose,
}: {
  cards: CardView[]
  onClose: () => void
}) {
  const [filter, setFilter] = useState<Filter>('All')

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const visibleCards = filter === 'All'
    ? cards
    : cards.filter((card) => card.type === filter)

  return (
    <div
      className="absolute inset-0 z-[240] flex items-center justify-center bg-black/80 backdrop-blur-[0.12cqw]"
      role="presentation"
      onClick={(event) => {
        event.stopPropagation()
        onClose()
      }}
    >
      <section
        aria-label="Discard pile"
        aria-modal="true"
        role="dialog"
        className="relative flex h-[86%] w-[90%] flex-col overflow-hidden rounded-[0.8cqw] border-[0.1cqw] border-amber-400/70 bg-zinc-950/95 px-[1.4cqw] pb-[1.2cqh] pt-[1.3cqh] text-stone-100 shadow-[0_0_2cqw_rgba(0,0,0,0.9),inset_0_0_1.2cqw_rgba(180,100,20,0.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          autoFocus
          type="button"
          aria-label="Close discard pile"
          className="absolute right-[0.8cqw] top-[0.8cqh] z-10 flex h-[2.1cqw] w-[2.1cqw] items-center justify-center rounded-full border-[0.08cqw] border-amber-300/70 bg-amber-950/90 font-heading text-[1.25cqw] leading-none text-amber-100 transition hover:border-amber-100 hover:bg-amber-800 focus:outline-none focus:ring-[0.12cqw] focus:ring-amber-200"
          onClick={onClose}
        >
          ×
        </button>

        <header className="shrink-0 pr-[3cqw]">
          <h2 className="font-heading text-[1.5cqw] uppercase tracking-[0.08em] text-amber-300">
            Discard pile
          </h2>
          <p className="mt-[0.15cqh] text-[0.65cqw] text-stone-400">
            {cards.length} {cards.length === 1 ? 'card' : 'cards'} · top card first
          </p>
        </header>

        <div className="mt-[1cqh] flex shrink-0 flex-wrap gap-[0.45cqw] border-b border-amber-700/40 pb-[1cqh]">
          {(['All', ...DISCARD_TYPES] as Filter[]).map((type) => {
            const selected = type === filter
            const count = type === 'All'
              ? cards.length
              : cards.filter((card) => card.type === type).length
            return (
              <button
                key={type}
                type="button"
                aria-pressed={selected}
                className={`rounded-full border px-[0.75cqw] py-[0.32cqh] font-heading text-[0.62cqw] uppercase tracking-[0.06em] transition ${
                  selected
                    ? 'border-amber-200 bg-amber-700 text-white shadow-[0_0_0.45cqw_rgba(245,158,11,0.35)]'
                    : 'border-amber-700/60 bg-zinc-900 text-stone-300 hover:border-amber-300 hover:text-amber-100'
                }`}
                onClick={() => setFilter(type)}
              >
                {type} <span className="ml-[0.18cqw] opacity-70">{count}</span>
              </button>
            )
          })}
        </div>

        <div className="discard-scroll mt-[1.2cqh] min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-[0.45cqw]">
          {visibleCards.length > 0 ? (
            <div className="grid grid-cols-6 items-start gap-x-[1cqw] gap-y-[2.1cqh]">
              {visibleCards.map((card) => (
                <DiscardCard
                  key={card.id}
                  card={card}
                  index={cards.findIndex((candidate) => candidate.id === card.id)}
                  top={card.id === cards[0]?.id}
                  onPicked={onClose}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center font-heading text-[0.9cqw] text-stone-500">
              No cards of this type
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
