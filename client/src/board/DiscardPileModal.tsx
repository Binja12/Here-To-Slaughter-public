import AssetImage from '../loading/AssetImage'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CardType, CardView } from '../contract'
import { artFor } from './assets'
import { DISCARD_ART, DISCARD_PANEL, inkScale } from './layout'
import { tkey, useTargetable, useTargeting } from './targeting'
import { useAudio } from '../audio/AudioProvider'

/** the card types that ever reach the pile — one painted plaque each */
const DISCARD_TYPES = ['Hero', 'Item', 'Magic', 'Modifier', 'Challenge'] as const satisfies readonly CardType[]

type DiscardType = (typeof DISCARD_TYPES)[number]
/** the plaque row: ALL plus one per type */
type Plaque = 'All' | DiscardType

const PLAQUES: Plaque[] = ['All', ...DISCARD_TYPES]

const isDiscardType = (type: CardType): type is DiscardType =>
  (DISCARD_TYPES as readonly CardType[]).includes(type)

const everyType = () => new Set<DiscardType>(DISCARD_TYPES)

const { window: WINDOW, grid: GRID } = DISCARD_PANEL

/** the frame's inner window, as CSS box percentages of the panel */
const WINDOW_BOX: React.CSSProperties = {
  left: `${WINDOW.l * 100}%`,
  top: `${WINDOW.t * 100}%`,
  width: `${(WINDOW.r - WINDOW.l) * 100}%`,
  height: `${(WINDOW.b - WINDOW.t) * 100}%`,
}

/**
 * One filter plaque — a TOGGLE, not a radio: every type it is showing stands
 * in full colour, and pressing one greys it and drops its cards out of the
 * grid. The word is painted into the art, so the button carries no text of
 * its own; the count sits under it and the name rides on the button.
 */
function FilterPlaque({
  plaque,
  count,
  on,
  onToggle,
}: {
  plaque: Plaque
  count: number
  on: boolean
  onToggle: (plaque: Plaque) => void
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <button
        type="button"
        aria-pressed={on}
        aria-label={`${plaque}, ${count} ${count === 1 ? 'card' : 'cards'}`}
        className="group relative w-full transition-transform duration-150 ease-out hover:scale-[1.06] focus:outline-none"
        style={{ height: `${DISCARD_PANEL.plaqueRowH}cqh` }}
        onClick={() => onToggle(plaque)}
      >
        {/* `object-contain` fits the sheet to the slot WIDTH, and about a
            third of every sheet is transparent margin — `inkScale` blows it
            back up until the PAINT fills the slot, at one weight across all
            six however differently each was painted. It must not hit-test:
            scaled up it overhangs into the neighbouring slots. */}
        <AssetImage
          src={DISCARD_ART[plaque]}
          alt=""
          aria-hidden
          draggable={false}
          className={`pointer-events-none absolute inset-0 h-full w-full select-none object-contain transition duration-150 ease-out group-focus-visible:drop-shadow-[0_0_0.5cqw_rgba(255,230,150,0.9)] ${
            on
              ? 'group-hover:drop-shadow-[0_0_0.5cqw_rgba(255,185,60,0.8)]'
              : 'opacity-40 grayscale group-hover:opacity-60'
          }`}
          style={{ transform: `scale(${inkScale(plaque)})` }}
        />
      </button>
      <span
        aria-hidden
        className={`font-heading text-[0.72cqw] leading-none tracking-[0.1em] transition-colors ${
          on ? 'text-amber-200' : 'text-stone-600'
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
  picking,
  onPicked,
}: {
  card: CardView
  /** the card's place in the WHOLE pile — what a discard target is keyed by */
  index: number
  top: boolean
  /** a pick out of the pile is live: the cards that are not the answer are dark */
  picking: boolean
  onPicked: () => void
}) {
  const key = tkey.discardCard(index)
  const target = useTargetable(key)
  const { pick } = useTargeting()
  const pickable = target.mode === 'target'
  // only during the browser's OWN pick does the panel drop `dim-exempt`, so
  // this is the one case where a card in here is genuinely dark and must not
  // answer a hover like a live one
  const dark = picking && !pickable
  const { playSound } = useAudio()

  return (
    <article
      title={card.name}
      onMouseEnter={() => { if (!dark) playSound('discardHover') }}
      role={pickable ? 'button' : undefined}
      tabIndex={pickable ? 0 : -1}
      className={`relative min-w-0 rounded-[0.4cqw] transition-transform duration-150 ease-out focus:outline-none focus-visible:outline focus-visible:outline-[0.3cqh] focus-visible:outline-offset-[0.35cqh] focus-visible:outline-amber-200 ${
        dark ? '' : 'hover:-translate-y-[0.5cqh]'
      } ${target.className}`}
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
        pick(key)
        onPicked()
      }}
    >
      <AssetImage
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
  /** the types the grid is showing — every plaque is its own on/off switch */
  const [shown, setShown] = useState<Set<DiscardType>>(everyType)
  const { active } = useTargeting()

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  // A pick out of the pile is answered in HERE, so switches left over from
  // browsing must never be what hides the card the engine is asking for.
  const picking = !!active?.targets.some((key) => key.startsWith('discardCard:'))
  useEffect(() => {
    if (picking) setShown(everyType())
  }, [picking])

  const allOn = DISCARD_TYPES.every((type) => shown.has(type))

  const toggle = useCallback((plaque: Plaque) => {
    setShown((was) => {
      // ALL is the master switch: it turns every type on, or — when they are
      // already all on — off, which is the "show me nothing" rest state.
      if (plaque === 'All') {
        return DISCARD_TYPES.every((type) => was.has(type)) ? new Set<DiscardType>() : everyType()
      }
      const next = new Set(was)
      if (!next.delete(plaque)) next.add(plaque)
      return next
    })
  }, [])

  // number every card by its place in the pile ONCE — the grid filters that
  // list, so a card keeps its pile index whatever the switches show
  const pile = useMemo(() => cards.map((card, index) => ({ card, index })), [cards])
  const counts = useMemo(() => {
    const tally: Record<string, number> = { All: cards.length }
    for (const type of DISCARD_TYPES) tally[type] = 0
    for (const card of cards) tally[card.type] = (tally[card.type] ?? 0) + 1
    return tally
  }, [cards])

  const visible = pile.filter(
    (entry) =>
      (isDiscardType(entry.card.type) ? shown.has(entry.card.type) : allOn) ||
      // a switch must never hide the card the engine is waiting for — the
      // reset above only fires on the edge into targeting, and the plaques
      // stay live while a pick is open
      active?.targets.includes(tkey.discardCard(entry.index)),
  )

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
        <AssetImage
          src={DISCARD_ART.frame}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill drop-shadow-[0_0_2.5cqw_rgba(0,0,0,0.95)]"
        />

        <div className="absolute flex flex-col" style={WINDOW_BOX}>
          {/* right-aligned: the Game log panel unfurls down the board's
              top-left corner (Board.tsx, `left-3 top-3`, w-80) and used to
              land straight on the title */}
          <header className="flex shrink-0 items-baseline justify-end gap-[1.1cqh] pr-[4.5cqh]">
            <h2 className="font-heading text-[1.15cqw] uppercase leading-none tracking-[0.16em] text-amber-200 drop-shadow-[0_0.15cqh_0.3cqw_rgba(0,0,0,0.95)]">
              Discard pile
            </h2>
            <p className="font-heading text-[0.62cqw] uppercase leading-none tracking-[0.1em] text-amber-100/50">
              {allOn
                ? `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`
                : `${visible.length} of ${cards.length}`}
              {cards.length > 0 && ' · top card first'}
            </p>
          </header>

          <button
            autoFocus
            type="button"
            aria-label="Close discard pile"
            className="absolute right-0 top-0 z-10 flex h-[3.6cqh] w-[3.6cqh] items-center justify-center rounded-full border-[0.12cqh] border-amber-300/60 bg-[#2a0d0a]/95 pb-[0.25cqh] font-heading text-[1.3cqw] leading-none text-amber-200 shadow-[0_0_0.7cqw_rgba(0,0,0,0.95)] transition hover:border-amber-100 hover:bg-amber-800 hover:text-white focus:outline-none focus:ring-[0.15cqh] focus:ring-amber-200"
            onClick={onClose}
          >
            ×
          </button>

          <div className="mt-[1.2cqh] flex w-full shrink-0 items-start">
            {PLAQUES.map((plaque) => (
              <FilterPlaque
                key={plaque}
                plaque={plaque}
                count={counts[plaque] ?? 0}
                on={plaque === 'All' ? allOn : shown.has(plaque)}
                onToggle={toggle}
              />
            ))}
          </div>

          {/* the gold hairline the plaques stand on */}
          <div
            aria-hidden
            className="mt-[0.8cqh] h-[0.3cqh] w-full shrink-0 bg-gradient-to-r from-transparent via-amber-400/80 to-transparent shadow-[0_0_0.4cqw_rgba(245,158,11,0.35)]"
          />

          {/* the clip has to clear what leaves a card: a pick's aura spreads
              ~0.64cqw (1.14cqh) past it, and the top card's badge rides
              0.45cqh above its corner, 0.5cqh more once it lifts on hover */}
          <div className="discard-scroll mt-[1.4cqh] min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-[0.8cqw] py-[1.5cqh]">
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
                    picking={picking}
                    onPicked={onClose}
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center font-heading text-[0.95cqw] uppercase tracking-[0.14em] text-stone-500">
                {cards.length === 0
                  ? 'The pile is empty'
                  : shown.size === 0
                    ? 'No card types shown'
                    : 'No cards of these types'}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
