import React, { useEffect, useMemo, useState } from 'react'
import { CardView } from '../contract'
import { artFor } from './assets'
import { DISCARD_ART, DISCARD_PANEL, PLAQUE_PICKED, inkScale } from './layout'
import { tkey, useTargetable, useTargeting } from './targeting'

/** the card types that ever reach the pile — one painted plaque each */
const DISCARD_TYPES = ['Hero', 'Item', 'Magic', 'Modifier', 'Challenge'] as const

type DiscardType = (typeof DISCARD_TYPES)[number]
type Filter = 'All' | DiscardType

const FILTERS: Filter[] = ['All', ...DISCARD_TYPES]

const { window: WINDOW, grid: GRID } = DISCARD_PANEL

/** the frame's inner window, as CSS box percentages of the panel */
const WINDOW_BOX: React.CSSProperties = {
  left: `${WINDOW.l * 100}%`,
  top: `${WINDOW.t * 100}%`,
  width: `${(WINDOW.r - WINDOW.l) * 100}%`,
  height: `${(WINDOW.b - WINDOW.t) * 100}%`,
}

/**
 * One filter plaque. The word is PAINTED into the art, so the button carries
 * no text of its own — the count sits under it and the name rides on the
 * button. The chosen one burns bright and steps forward; the rest sit back,
 * and a type with nothing in the pile greys out (still pressable — it just
 * says so once you are there).
 */
function FilterPlaque({
  filter,
  count,
  selected,
  onSelect,
}: {
  filter: Filter
  count: number
  selected: boolean
  onSelect: (filter: Filter) => void
}) {
  const empty = count === 0
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${filter}, ${count} ${count === 1 ? 'card' : 'cards'}`}
        className="group relative w-full focus:outline-none"
        style={{ height: `${DISCARD_PANEL.plaqueRowH}cqh` }}
        onClick={() => onSelect(filter)}
      >
        {/* `object-contain` fits the sheet to the slot WIDTH, and about a
            third of every sheet is transparent margin — `inkScale` blows it
            back up until the PAINT fills the slot, at one weight across all
            six however differently each was painted. */}
        <img
          src={DISCARD_ART[filter]}
          alt=""
          aria-hidden
          draggable={false}
          className={`absolute inset-0 h-full w-full select-none object-contain transition duration-150 ease-out group-focus-visible:drop-shadow-[0_0_0.5cqw_rgba(255,230,150,0.9)] ${
            selected
              ? 'brightness-[1.12] drop-shadow-[0_0_0.55cqw_rgba(255,185,60,0.85)]'
              : empty
                ? 'opacity-45 grayscale'
                : 'brightness-[0.82] saturate-[0.88] group-hover:brightness-[1.05] group-hover:saturate-100'
          }`}
          style={{
            transform: `scale(${inkScale(filter) * (selected ? PLAQUE_PICKED : 1)})`,
          }}
        />
      </button>
      <span
        aria-hidden
        className={`font-heading text-[0.72cqw] leading-none tracking-[0.1em] transition-colors ${
          selected
            ? 'text-amber-200 drop-shadow-[0_0_0.3cqw_rgba(255,190,70,0.7)]'
            : empty
              ? 'text-stone-600'
              : 'text-stone-400'
        }`}
      >
        {count}
      </span>
    </div>
  )
}

function DiscardCard({
  card,
  index,
  top,
  onPicked,
}: {
  card: CardView
  /** the card's place in the WHOLE pile — what a discard target is keyed by */
  index: number
  top: boolean
  onPicked: () => void
}) {
  const target = useTargetable(tkey.discardCard(index))
  const pickable = target.mode === 'target'

  return (
    <article
      title={card.name}
      tabIndex={pickable ? 0 : -1}
      className={`relative min-w-0 rounded-[0.4cqw] transition-transform duration-150 ease-out hover:-translate-y-[0.5cqh] focus:outline-none ${target.className}`}
      onClick={(event) => {
        target.onClick(event)
        if (pickable) onPicked()
      }}
      onKeyDown={(event) => {
        // the pile that opens this browser is keyboard-operable, so the card
        // you answer with has to be too
        if (!pickable || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        event.stopPropagation()
        target.onClick(event as unknown as React.MouseEvent)
        onPicked()
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
  const { active } = useTargeting()

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  // A pick out of the pile is answered in HERE, so a filter left over from
  // browsing must never be what hides the card the engine is asking for.
  const picking = !!active?.targets.some((key) => key.startsWith('discardCard:'))
  useEffect(() => {
    if (picking) setFilter('All')
  }, [picking])

  // number every card by its place in the pile ONCE — the grid filters that
  // list, so a card keeps its pile index whatever the filter shows
  const pile = useMemo(() => cards.map((card, index) => ({ card, index })), [cards])
  const counts = useMemo(() => {
    const tally: Record<string, number> = { All: cards.length }
    for (const type of DISCARD_TYPES) tally[type] = 0
    for (const card of cards) tally[card.type] = (tally[card.type] ?? 0) + 1
    return tally
  }, [cards])

  const visible =
    filter === 'All' ? pile : pile.filter((entry) => entry.card.type === filter)

  return (
    <div
      // The browser floats over everything — a challenge on stage, a reaction
      // window, an aim somewhere else on the table — and its whole subtree
      // opts out of those dims, or every card in here renders at
      // brightness(0.35) and reads as "the art failed to load". The one dim
      // it keeps is its OWN pick: then the dark is what marks the single card
      // in the pile you may take.
      className={`absolute inset-0 z-[240] flex items-center justify-center bg-black/80 backdrop-blur-[0.12cqw]${
        picking ? '' : ' dim-exempt'
      }`}
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
        className="relative text-stone-100"
        style={{
          height: `${DISCARD_PANEL.h}cqh`,
          width: `${DISCARD_PANEL.h * DISCARD_PANEL.aspect}cqh`,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* a dark plate under the frame so no board shows through the window
            while the painted panel decodes */}
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[2cqh] bg-[#160b09]"
          style={WINDOW_BOX}
        />
        <img
          src={DISCARD_ART.frame}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill drop-shadow-[0_0_2.5cqw_rgba(0,0,0,0.95)]"
        />

        <div className="absolute flex flex-col" style={WINDOW_BOX}>
          <header className="flex shrink-0 items-baseline gap-[1.1cqh] pr-[4.5cqh]">
            <h2 className="font-heading text-[1.15cqw] uppercase leading-none tracking-[0.16em] text-amber-200 drop-shadow-[0_0.15cqh_0.3cqw_rgba(0,0,0,0.95)]">
              Discard pile
            </h2>
            <p className="font-heading text-[0.62cqw] uppercase leading-none tracking-[0.1em] text-amber-100/50">
              {filter === 'All'
                ? `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`
                : `${visible.length} of ${cards.length}`}
              {cards.length > 0 && ' · top card first'}
            </p>
          </header>

          <button
            autoFocus
            type="button"
            aria-label="Close discard pile"
            className="absolute right-0 top-0 z-10 flex h-[3.6cqh] w-[3.6cqh] items-center justify-center rounded-full border-[0.12cqh] border-amber-300/60 bg-[#2a0d0a]/95 pb-[0.25cqh] font-heading text-[1.3cqw] leading-none text-amber-200 shadow-[0_0_0.7cqw_rgba(0,0,0,0.95)] transition hover:border-amber-100 hover:bg-amber-800 hover:text-white focus:outline-none focus-visible:ring-[0.15cqh] focus-visible:ring-amber-200"
            onClick={onClose}
          >
            ×
          </button>

          <div className="mt-[1.2cqh] flex w-full shrink-0 items-start">
            {FILTERS.map((type) => (
              <FilterPlaque
                key={type}
                filter={type}
                count={counts[type] ?? 0}
                selected={type === filter}
                onSelect={setFilter}
              />
            ))}
          </div>

          {/* the gold hairline the plaques stand on */}
          <div
            aria-hidden
            className="mt-[0.8cqh] h-[0.3cqh] w-full shrink-0 bg-gradient-to-r from-transparent via-amber-400/80 to-transparent shadow-[0_0_0.4cqw_rgba(245,158,11,0.35)]"
          />

          {/* a pickable card's aura spreads ~0.65cqw past it: the scroller is
              padded so the glow lands inside the clip, not on it */}
          <div className="discard-scroll mt-[1.4cqh] min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-[0.8cqw] py-[0.6cqh]">
            {visible.length > 0 ? (
              <div
                className="grid items-start"
                style={{
                  gridTemplateColumns: `repeat(${GRID.cols}, minmax(0, 1fr))`,
                  columnGap: `${GRID.gapX}cqh`,
                  rowGap: `${GRID.gapY}cqh`,
                }}
              >
                {visible.map(({ card, index }) => (
                  <DiscardCard
                    key={card.id}
                    card={card}
                    index={index}
                    top={index === 0}
                    onPicked={onClose}
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center font-heading text-[0.95cqw] uppercase tracking-[0.14em] text-stone-500">
                {cards.length === 0 ? 'The pile is empty' : 'No cards of this type'}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
