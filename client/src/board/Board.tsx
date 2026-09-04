import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Anchor,
  ASPECT,
  CENTER_DX,
  CENTER_DY,
  CENTER_H,
  CENTER_SLOTS,
  DECK_SLOTS,
  DeckDef,
  deckWidthCqh,
  FRAMES,
  HUD,
  HUD_ASPECT,
  HUD_WIDGETS,
  HudDef,
  INSET,
  PLAYERS,
  PlayerId,
  positionStyle,
  TABLE_BG,
  WidgetDef,
  widthCqh,
} from './layout'
import { artFor, BIG_BACK, boardModifierUrl, SMALL_BACK } from './assets'
import HeroRow, { Seat as HeroSeat } from './HeroRow'
import PlayerHand from './PlayerHand'
import HandCount from './HandCount'
import DiceRoll from './DiceRoll'
import ChallengeWindow from './ChallengeWindow'
import { ChallengeProvider, ChallengeRole, useChallenge } from './challenge'
import { bonusesOf, liveRollOf, rollLabel, subjectIdOf, useLiveDice } from './liveRoll'
import { useChallengeSync } from './useChallengeSync'
import { derivePlayable, isOptionalWindow } from './playable'
import {
  TargetingProvider,
  TargetKey,
  tkey,
  useTargetable,
  useTargeting,
} from './targeting'
import { useGameView } from '../state/game'
import { useSend } from '../state/commands'
import {
  CardView,
  CommandResult,
  GameCommandInput,
  ModifierCardData,
  PartyView,
  PendingWindowView,
  PlayerView,
  REFUSAL_MESSAGES,
} from '../contract'
import { slotsFor } from './seats'
import {
  discardCardsForView,
  idForTargetKey,
  targetKeyForId,
} from './viewTargets'
import { useHoverZoom } from './useHoverZoom'
import PendingWindows from './PendingWindows'
import DiscardPileModal from './DiscardPileModal'
import RevealedCards from './RevealedCards'

function Widget({
  def,
  anchor,
  zClass = 'z-20',
  zIndex,
  dimExempt = false,
  children,
}: {
  def: WidgetDef
  anchor: Anchor
  zClass?: string
  /** inline z (beats the classes) — the hand above the challenge shield */
  zIndex?: number
  /** keep this widget bright while a challenge dims the board */
  dimExempt?: boolean
  children?: React.ReactNode
}) {
  const inset = INSET[def.kind]
  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${zClass} has-[:hover]:z-[100]${
        dimExempt ? ' dim-exempt' : ''
      }`}
      style={{
        height: `${def.h}cqh`,
        width: `${widthCqh(def)}cqh`,
        zIndex,
        ...positionStyle(anchor, def.dx, def.dy),
      }}
    >
      <img
        src={FRAMES[def.kind]}
        alt=""
        aria-hidden
        draggable={false}
        className="dimmable pointer-events-none absolute inset-0 h-full w-full object-fill"
      />
      <div
        className="absolute"
        style={{
          left: `${((1 - inset.w) / 2) * 100}%`,
          top: `${((1 - inset.h) / 2) * 100}%`,
          width: `${inset.w * 100}%`,
          height: `${inset.h * 100}%`,
        }}
      >
        {children}
      </div>
    </div>
  )
}

function SlotCard({
  card,
  alt,
  stretch = false,
  zoom,
  origin = '50% 50%',
  playable = false,
  enemy = false,
  passive = false,
  targetKey,
  onActivate,
}: {
  card: CardView
  alt?: string
  stretch?: boolean
  zoom?: number
  origin?: string
  playable?: boolean
  /** an opponent attacks this monster right now: red */
  enemy?: boolean
  /** this monster's standing rule is working right now (its counter feeds the open roll): pink */
  passive?: boolean
  targetKey?: TargetKey
  onActivate?: () => void
}) {
  // A slot card (the monster row) shrinks back as soon as the cursor leaves
  // its resting footprint, not its enlarged box.
  const hz = useHoverZoom<HTMLImageElement>(undefined, undefined, { stickyBounds: 'rest' })
  const target = useTargetable(targetKey, onActivate)
  const zoomable = zoom !== undefined && !(target.targeting && target.mode === 'dimmed')
  const art = artFor(card)
  return (
    <div className="flex h-full w-full items-center justify-center">
      <img
        ref={zoomable ? hz.ref : undefined}
        src={art.url}
        alt={alt ?? card.name}
        draggable={false}
        className={`select-none rounded-[0.3cqw] shadow-[0.15cqw_0.3cqw_0.8cqw_rgba(0,0,0,0.7)] transition-transform duration-150 ${
          stretch ? 'h-full w-full object-fill' : 'max-h-[90%] max-w-[90%] object-contain'
        }${enemy ? ' enemy-aura card-aura-sm' : playable ? ' card-aura card-aura-sm' : passive ? ' passive-aura card-aura-sm' : ''} ${target.className}`}
        style={{
          transformOrigin: origin,
          transform: zoomable && hz.active ? `scale(${zoom})` : undefined,
        }}
        onClick={target.onClick}
        onMouseEnter={zoomable ? hz.onMouseEnter : undefined}
        onMouseLeave={zoomable ? hz.onMouseLeave : undefined}
        onContextMenu={zoomable ? hz.onContextMenu : undefined}
      />
    </div>
  )
}

/** Each slain-monster trophy covers a tenth of the one before it. */
const TROPHY_OVERLAP = 0.1

/**
 * A party leader with its slain monsters tucked behind it. The leader zooms
 * on hover like a hero (`useHoverZoom`, capped by the caller so the enlarged
 * card stays inside the stage); while zoomed the trophies fan out beside it
 * at 80% of its size, the first flush against it and each next one a card
 * step further, overlapping by `TROPHY_OVERLAP`. A trophy that is a pick
 * target while the leader is at rest steps out at its own size instead.
 */
function LeaderWithCards({
  slot,
  party,
  origin,
  revealSide,
  playable,
  passive = false,
  enemy = false,
  zoom,
  onActivate,
}: {
  slot: PlayerId
  party: PartyView
  origin: string
  revealSide: 'left' | 'right'
  playable: boolean
  /** its standing effect feeds the open roll: gold */
  /** the leader's standing effect is working right now (feeds the open roll): pink */
  passive?: boolean
  /** an opponent rolls on it right now: red */
  enemy?: boolean
  zoom: number
  onActivate?: () => void
}) {
  const direction = revealSide === 'left' ? -1 : 1
  const leaderTarget = useTargetable(tkey.leader(slot), onActivate)
  const leaderArt = artFor(party.leader)
  const trophyRefs = useRef<Array<HTMLDivElement | null>>([])
  const getTrophies = useCallback(() => trophyRefs.current, [])
  const hz = useHoverZoom<HTMLImageElement>(undefined, getTrophies)
  const dimmed = leaderTarget.targeting && leaderTarget.mode === 'dimmed'
  const zoomed = hz.active && !dimmed
  const trophyScale = zoom * 0.8
  // centre-to-centre distances in trophy widths: inner edges touching the
  // zoomed leader (minus a hair, glued), then one overlapped step each
  const firstShift = (zoom + trophyScale) / 2 - 0.12
  const step = trophyScale * (1 - TROPHY_OVERLAP)

  return (
    <div className="relative h-full w-full">
      {party.monsters.map((monster, index) => (
        <Trophy
          key={monster.id}
          ref={(element) => {
            trophyRefs.current[index] = element
          }}
          card={monster}
          targetKey={tkey.slainMonster(slot, index)}
          revealed={zoomed}
          shiftPct={direction * (firstShift + index * step) * 100}
          restShiftPct={direction * (1 + index) * (1 - TROPHY_OVERLAP) * 100}
          scale={trophyScale}
          origin={origin}
        />
      ))}
      <img
        ref={hz.ref}
        src={leaderArt.url}
        alt={party.leader.name}
        draggable={false}
        className={`absolute inset-0 z-20 h-full w-full select-none rounded-[0.3cqw] object-fill shadow-[0.15cqw_0.3cqw_0.8cqw_rgba(0,0,0,0.7)] transition-transform duration-[120ms] ease-out ${
          enemy ? 'enemy-aura card-aura-sm ' : playable ? 'card-aura card-aura-sm ' : passive ? 'passive-aura card-aura-sm ' : ''
        }${leaderTarget.className}`}
        style={{
          transformOrigin: origin,
          transform: zoomed ? `scale(${zoom})` : undefined,
        }}
        onMouseEnter={dimmed ? undefined : hz.onMouseEnter}
        onMouseLeave={hz.onMouseLeave}
        onContextMenu={hz.onContextMenu}
        onClick={leaderTarget.onClick}
      />
    </div>
  )
}

const Trophy = React.forwardRef<
  HTMLDivElement,
  {
    card: CardView
    targetKey: TargetKey
    /** the leader is zoomed: fan out beside it, enlarged */
    revealed: boolean
    /** translateX while revealed, % of the trophy's own width */
    shiftPct: number
    /** translateX while a pick target at rest, % of own width */
    restShiftPct: number
    scale: number
    origin: string
  }
>(function Trophy(
  { card, targetKey, revealed, shiftPct, restShiftPct, scale, origin },
  ref,
) {
  const target = useTargetable(targetKey)
  const art = artFor(card)
  const pickable = target.targeting && target.mode === 'target'
  const out = revealed || pickable
  return (
    <div
      ref={ref}
      className={`absolute inset-0 rounded-[0.3cqw] transition-transform duration-[120ms] ease-out ${target.className}`}
      style={{
        zIndex: out ? 40 : 0,
        pointerEvents: out ? 'auto' : 'none',
        transformOrigin: origin,
        transform: revealed
          ? `translateX(${shiftPct}%) scale(${scale})`
          : pickable
            ? `translateX(${restShiftPct}%)`
            : 'translateY(10%)',
      }}
      onClick={target.onClick}
    >
      <img
        src={art.url}
        alt={`${card.name}, slain monster`}
        draggable={false}
        className="absolute inset-0 h-full w-full select-none rounded-[0.3cqw] object-fill"
      />
    </div>
  )
})

function DeckSlot({ def, children }: { def: DeckDef; children: React.ReactNode }) {
  return (
    <div
      className="absolute z-30 -translate-x-1/2 -translate-y-1/2 has-[:hover]:z-[100]"
      style={{
        height: `${def.h}cqh`,
        width: `${deckWidthCqh(def)}cqh`,
        ...positionStyle('center', def.dx, def.dy),
      }}
    >
      {children}
    </div>
  )
}

function DeckPile({
  count,
  back,
  playable,
  targetKey,
  onActivate,
}: {
  count: number
  back: string
  playable?: boolean
  targetKey: TargetKey
  onActivate?: () => void
}) {
  const target = useTargetable(targetKey, onActivate)
  // up to four backs, each a little off and tilted like a real pile
  const layers = Math.max(1, Math.min(PILE_LAYERS, count))
  return (
    <div className={`relative h-full w-full ${target.className}`} onClick={target.onClick}>
      {Array.from({ length: layers }, (_, index) => {
        const top = index === layers - 1
        return (
          <img
            key={index}
            src={back}
            alt={top ? 'deck' : ''}
            aria-hidden={!top}
            draggable={false}
            className={`absolute inset-0 h-full w-full select-none rounded-[0.3cqw] object-contain shadow-[0.1cqw_0.2cqw_0.5cqw_rgba(0,0,0,0.6)]${
              playable && top ? ' card-aura' : ''
            }`}
            style={{ transform: deckOffset(index, layers) }}
          />
        )
      })}
      <span
        className="pointer-events-none absolute left-1/2 top-[30%] z-10 -translate-x-1/2 -translate-y-1/2 text-[1.15cqw] leading-none text-[#5a4a33] drop-shadow-[0_0.05cqw_0.05cqw_rgba(255,240,200,0.6)]"
        style={{ fontFamily: "'Alfa Slab One', serif" }}
      >
        {count}
      </span>
    </div>
  )
}

function DiscardPile({
  cards,
  onOpen,
  playable,
  enemy = false,
}: {
  cards: CardView[]
  onOpen: () => void
  playable: boolean
  /** the top card is one an opponent just played (contested): red */
  enemy?: boolean
}) {
  const { active } = useTargeting()
  // an empty pile has nothing to browse: no dialog (it opened as a dark,
  // empty box — the owner read that as "only the dim")
  const target = useTargetable(tkey.discard(), cards.length > 0 ? onOpen : undefined)
  const choosingDiscardCard = cards.some((_, index) =>
    active?.targets.includes(tkey.discardCard(index)),
  )
  const visible = cards.slice(0, PILE_LAYERS).reverse()
  return (
    <div
      aria-label={`Open discard pile, ${cards.length} cards`}
      className={`relative h-full w-full ${
        choosingDiscardCard
          ? 'dimmable dim-exempt target-aura cursor-pointer'
          : target.className
      }`}
      role="button"
      tabIndex={target.mode === 'idle' || choosingDiscardCard ? 0 : -1}
      onClick={(event) => {
        if (choosingDiscardCard) {
          event.stopPropagation()
          onOpen()
          return
        }
        target.onClick(event)
      }}
      onKeyDown={(event) => {
        if (
          (target.mode === 'idle' || choosingDiscardCard) &&
          (event.key === 'Enter' || event.key === ' ')
        ) {
          event.preventDefault()
          event.stopPropagation()
          onOpen()
        }
      }}
    >
      {visible.map((card, index) => {
        const art = artFor(card)
        const top = index === visible.length - 1
        return (
          <img
            key={card.id}
            src={art.url}
            alt={top ? `${card.name}, discard top` : ''}
            aria-hidden={!top}
            draggable={false}
            className={`absolute inset-0 h-full w-full select-none rounded-[0.3cqw] object-contain shadow-[0.1cqw_0.2cqw_0.5cqw_rgba(0,0,0,0.6)]${
              top && enemy ? ' enemy-aura' : playable && top ? ' card-aura' : ''
            }`}
            style={{ transform: pileJitter(index, top) }}
          />
        )
      })}
    </div>
  )
}

/** How many cards a pile shows stacked. */
const PILE_LAYERS = 4

/** A DECK is squared up: each back a hair further up-right, no tilt. */
function deckOffset(index: number, layers: number): string {
  const depth = layers - 1 - index
  return `translate(${-depth * 0.14}cqw, ${depth * 0.14}cqw)`
}

/**
 * The DISCARD pile is where cards were tossed: each layer well off and
 * tilted (fixed per layer so the pile does not jump between renders), the
 * top card straight, as if just laid down.
 */
function pileJitter(index: number, top: boolean): string {
  const steps = [
    { x: -0.95, y: 0.85, r: -10 },
    { x: 0.8, y: -0.65, r: 7.5 },
    { x: -0.35, y: -0.9, r: -4.5 },
    { x: 0.55, y: 0.4, r: 9 },
  ]
  const step = steps[index % steps.length]
  return top
    ? 'translate(0, 0) rotate(0deg)'
    : `translate(${step.x}cqw, ${step.y}cqw) rotate(${step.r}deg)`
}

function HudWidget({
  def,
  aspect,
  title,
  children,
}: {
  def: HudDef
  aspect: number
  title?: string
  children: React.ReactNode
}) {
  return (
    <div
      className="absolute z-40 -translate-x-1/2 -translate-y-1/2"
      title={title}
      style={{
        height: `${def.h}cqh`,
        width: `${def.h * aspect}cqh`,
        ...positionStyle(def.anchor, def.dx, def.dy),
      }}
    >
      {children}
    </div>
  )
}

const AP_SLOT_X = [25.5, 37.5, 50, 62.4, 74.5]

function ActionPoints({ current }: { current: number }) {
  return (
    <div className="relative h-full w-full">
      <img src={HUD.actionFrame} alt="" aria-hidden className="dimmable absolute inset-0 h-full w-full object-fill" />
      {AP_SLOT_X.map((x, index) => (
        <img
          key={index}
          src={HUD.actionGem}
          alt="action point"
          draggable={false}
          className="dimmable ap-gem absolute aspect-square h-[68%] -translate-x-1/2 -translate-y-1/2 object-contain transition-all"
          style={{ left: `${x}%`, top: '51%', opacity: index < current ? 1 : 0 }}
        />
      ))}
    </div>
  )
}

/** Whether this build runs against the in-memory fakes (dev-only buttons). */
const FAKE_SERVER = process.env.REACT_APP_FAKE_SERVER === '1'

/** A plain dev/test button in the top-left row. */
function DevButton({
  label,
  enabled,
  onClick,
}: {
  label: string
  enabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="h-full w-full rounded-[0.45cqw] border-[0.12cqw] border-amber-300/70 bg-gradient-to-b from-amber-700 to-amber-950 px-[0.5cqw] font-heading text-[0.7cqw] uppercase tracking-wide text-amber-100 shadow-[inset_0_0_0.35cqw_rgba(255,210,100,0.25),0_0.25cqw_0.6cqw_rgba(0,0,0,0.65)] transition hover:brightness-125 disabled:cursor-not-allowed disabled:grayscale disabled:opacity-45"
    >
      {label}
    </button>
  )
}

/** A painted HUD button (the owner's End Turn / Redraw art). */
function ImageButton({
  src,
  label,
  enabled,
  onClick,
}: {
  src: string
  label: string
  enabled: boolean
  onClick: () => void
}) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={!enabled}
      onClick={onClick}
      className="group relative h-full w-full transition-transform duration-[120ms] ease-out enabled:hover:scale-105 enabled:active:scale-95 disabled:cursor-not-allowed disabled:grayscale disabled:opacity-50"
    >
      <img
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        className="dimmable absolute inset-0 h-full w-full object-contain group-enabled:group-hover:drop-shadow-[0_0_0.55cqw_rgba(255,190,70,0.95)]"
      />
    </button>
  )
}

function CenterArena({
  view,
  discardCards,
  discardPlayable,
  enemyIds,
  passiveIds,
  flags,
  activate,
  onOpenDiscard,
}: {
  view: PlayerView
  discardCards: CardView[]
  discardPlayable: boolean
  /** cards an opponent is acting with right now (red) */
  enemyIds: Set<string>
  /** cards whose effect is working right now (pink) */
  passiveIds: Set<string>
  flags: ReturnType<typeof derivePlayable>
  activate: (key: TargetKey) => void
  onOpenDiscard: () => void
}) {
  return (
    <>
      {CENTER_SLOTS.monsters.map((def, index) => {
        const card = view.monsterRow[index]
        return (
          <Widget key={index} def={def} anchor="center" zClass="z-30">
            {card && (
              <SlotCard
                card={card}
                alt={card.name}
                stretch
                zoom={MONSTER_ZOOM}
                playable={flags.monsters[index]}
                enemy={enemyIds.has(card.id)}
                passive={passiveIds.has(card.id)}
                targetKey={tkey.monster(index)}
                onActivate={flags.monsters[index] ? () => activate(tkey.monster(index)) : undefined}
              />
            )}
          </Widget>
        )
      })}
      <DeckSlot def={DECK_SLOTS.mainDeck}>
        <DeckPile
          count={view.mainDeck.count}
          back={SMALL_BACK}
          playable={flags.mainDeck}
          targetKey={tkey.mainDeck()}
          onActivate={flags.mainDeck ? () => activate(tkey.mainDeck()) : undefined}
        />
      </DeckSlot>
      <DeckSlot def={DECK_SLOTS.discard}>
        <DiscardPile
          cards={discardCards}
          onOpen={onOpenDiscard}
          playable={discardPlayable}
          enemy={discardCards.length > 0 && enemyIds.has(discardCards[0].id)}
        />
      </DeckSlot>
      <DeckSlot def={DECK_SLOTS.monsterDeck}>
        <DeckPile count={view.monsterDeck.count} back={BIG_BACK} targetKey={tkey.monsterDeck()} />
      </DeckSlot>
    </>
  )
}

const HERO_SEAT: Record<PlayerId, HeroSeat> = {
  p1: 'bottom',
  p2: 'top',
  p3: 'left',
  p4: 'right',
}

/** how much a monster in the row grows on hover */
const MONSTER_ZOOM = 3
/** the height (cqh) of a zoomed monster — the size every zoomed leader matches */
const MONSTER_ZOOMED_H = CENTER_SLOTS.monsters[0].h * INSET.big.h * MONSTER_ZOOM

/**
 * Where a zoomed leader grows from: its edge nearest the stage border, so
 * at MONSTER_ZOOMED_H the enlarged card never leaves the stage (the side
 * leaders sit high, so they grow down and inward from their top corner).
 */
const LEADER_ZOOM_ORIGIN: Record<Anchor, string> = {
  bottom: '50% 100%',
  top: '50% 0%',
  left: '0% 0%',
  right: '100% 0%',
  center: '50% 50%',
}

/** Choice windows answered by pressing a glowing card on the board. */
const BOARD_CHOICES = new Set(['CardChoice', 'PlayerChoice', 'MonsterChoice'])

/**
 * The card a yes/no window is about. The server's ConfirmTask detail is
 * `{ confirms, sourceCardId, cardId?, ctxSeed? }` — "roll on the hero you
 * just played" names the hero as `sourceCardId` and has no `cardId` (seen
 * live 2026-09-03, which is why the gold ask never showed).
 */
function askedCardOf(window: PendingWindowView): string | undefined {
  const detail = window.detail ?? {}
  const id = detail.cardId ?? detail.sourceCardId
  return typeof id === 'string' ? id : undefined
}

export default function Board({ onLeave }: { onLeave?: () => void }) {
  return (
    <TargetingProvider>
      <ChallengeProvider>
        <BoardInner onLeave={onLeave} />
      </ChallengeProvider>
    </TargetingProvider>
  )
}

function BoardInner({ onLeave }: { onLeave?: () => void }) {
  const view = useGameView()
  const send = useSend()
  const flags = derivePlayable(view)
  const discardCards = discardCardsForView(view)
  const slots = slotsFor(view)
  const { active, begin, cancel } = useTargeting()
  // The two dramatic windows, driven from the view: the dice on the felt for
  // a hero / leader / attack roll, the paused-game overlay for a challenge.
  const challenge = useChallenge()
  const liveChallenge = useChallengeSync(view)
  // The overlay can be put away (click its backdrop) to look at the table,
  // and brought back with the top-left Challenge button. A new challenge
  // always shows itself.
  const [overlayHidden, setOverlayHidden] = useState(false)
  const liveChallengeId = liveChallenge?.windowId
  useEffect(() => {
    setOverlayHidden(false)
  }, [liveChallengeId])
  const challengeOpen = !!challenge.active && !overlayHidden
  const liveRoll = liveRollOf(view)
  const dice = useLiveDice(view, liveRoll)
  const [toast, setToast] = useState<string | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [modifierChoice, setModifierChoice] = useState<{
    card: ModifierCardData
    targetPlayerId: string
  } | null>(null)
  const mine = view.seats.find((seat) => seat.playerId === view.playerId)
  const current = view.seats.find((seat) => seat.playerId === view.currentPlayerId)
  const hasPlayableHandCard = flags.hand.some(Boolean)
  const canPlayModifier = view.hand.some(
    (card, index) => card.type === 'Modifier' && flags.hand[index],
  )
  const canPlayChallenge = view.hand.some(
    (card, index) => card.type === 'Challenge' && flags.hand[index],
  )
  // The owner's rule (2026-09-03): only the FIRST thing you may do glows
  // green — the reaction card in your hand. What it can be aimed at lights
  // up gold only once you press it (targeting mode), so nothing on the
  // board is pre-highlighted for a reaction.
  const reactionTargetIds = new Set<string>()
  void canPlayChallenge
  void canPlayModifier

  // What the TABLE is doing, read off the open roll / challenge windows:
  //  - red: the card an OPPONENT just played (the contested card, until
  //    its challenge window closes) or rolls on (hero / leader / monster,
  //    until the roll closes); the dice go red with it;
  //  - pink: every card whose effect is WORKING right now — a standing
  //    effect that is live (the seats' effect lists) or one feeding the open
  //    roll (the server names them as the roll's bonus sources: "each time
  //    you roll to attack a monster, +1"). The owner's rule, 2026-09-04:
  //    gold = can pick, green = can play, pink = effect working.
  const enemyIds = new Set<string>()
  const bonusSourceIds = new Set<string>()
  for (const window of view.pendingWindows) {
    if (window.type !== 'Modifier' && window.type !== 'Attack' && window.type !== 'Challenge') continue
    if (window.respondentId !== view.playerId) {
      const subject = subjectIdOf(window)
      if (subject) enemyIds.add(subject)
    }
    const detail = window.detail ?? {}
    for (const list of [detail.bonuses, detail.challengerBonuses, detail.challengedBonuses]) {
      for (const bonus of bonusesOf(list)) if (bonus.cardSource) bonusSourceIds.add(bonus.cardSource)
    }
  }
  // pink: every card whose effect is working — a live standing effect at any
  // seat (the seats' effect lists name their source card) or a bonus source
  // of the open roll (heroes, items, leaders, a monster's counter)
  const passiveIds = new Set([
    ...view.seats.flatMap((seat) => seat.effects.map((effect) => effect.sourceCardId)),
    ...Array.from(bonusSourceIds),
  ])
  const diceTone = liveRoll && liveRoll.rollerId !== view.playerId ? 'enemy' : 'mine'

  // A reaction being aimed (modifier / challenge card pressed, board dimmed,
  // targets gold) or a value being picked loses its target when its window
  // lapses mid-resolution: the aim ends with it, the dim with the aim. The
  // test is the TARGETS, not "some window is open" — another window (an
  // unstarted challenge, say) can outlive the roll the modifier was for.
  const validReactionTargets = useMemo(() => {
    const keys = new Set<string>()
    for (const window of view.pendingWindows) {
      if (window.type === 'Modifier' || window.type === 'Attack') {
        const key = targetKeyForId(view, subjectIdOf(window))
        if (key) keys.add(key)
      } else if (window.type === 'Challenge') {
        if (window.detail?.challenged === true) {
          keys.add(tkey.challengeRoll('challenged'))
          keys.add(tkey.challengeRoll('challenger'))
        } else {
          const key = targetKeyForId(view, window.cardId)
          if (key) keys.add(key)
        }
      }
    }
    return keys
  }, [view])
  useEffect(() => {
    if (active?.tone === 'reaction' && !active.targets.some((key) => validReactionTargets.has(key))) {
      cancel()
    }
  }, [validReactionTargets, active, cancel])
  const modifierTargetGone =
    !!modifierChoice &&
    !view.pendingWindows.some(
      (window) =>
        (window.type === 'Modifier' || window.type === 'Attack' || window.type === 'Challenge') &&
        (window.respondentId === modifierChoice.targetPlayerId ||
          window.detail?.challengerId === modifierChoice.targetPlayerId ||
          window.detail?.defenderId === modifierChoice.targetPlayerId),
    )
  useEffect(() => {
    if (modifierTargetGone) setModifierChoice(null)
  }, [modifierTargetGone])
  const discardPlayable = discardCards.some((card) =>
    reactionTargetIds.has(card.id),
  )

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 3200)
  }

  const handleResult = (result: CommandResult): boolean => {
    if (result.accepted) return true
    cancel()
    if ('reason' in result) {
      showToast(REFUSAL_MESSAGES[result.reason])
    } else {
      console.error('Game command failed with InternalError', result)
      showToast('Something went wrong. Please try again.')
    }
    return false
  }

  // The result overlay can be put away to look at the final table; nothing
  // is sent until Exit.
  const [resultHidden, setResultHidden] = useState(false)
  const phase = view.phase
  useEffect(() => {
    setResultHidden(false)
  }, [phase])
  const leaveGame = () => {
    void send({ type: 'LeaveGame', payload: {} }).then((result) => {
      if (handleResult(result)) onLeave?.()
    })
  }

  /**
   * Give the table's open window up (the Skip button, HUD or overlay). Sent
   * DIRECTLY, not through `run`: a pass is about the table's window and must
   * never decline the viewer's own open question on the way (seen live: Skip
   * dismissed "roll on the hero you just played?", so Buttons never pulled).
   */
  const forfeitWindow = async (): Promise<boolean> => {
    if (!flags.passable) return false
    const result = await send({ type: 'PassWindow', payload: { windowId: flags.passable } })
    return handleResult(result)
  }

  const run = async (command: GameCommandInput): Promise<boolean> => {
    // another action while an optional question is open = "no, thanks":
    // the engine is busy until it is answered, so decline it first
    if (command.type !== 'SubmitChoice' && !(await forfeit())) return false
    const result = await send(command)
    return handleResult(result)
  }

  // A choice the engine asks of THIS seat, answered by pressing a gold
  // target on the board, no buttons:
  //  - a card / player / monster choice whose every option is on the board;
  //  - a yes/no about a card on the board ("roll on the hero you just
  //    played?"): the card glows, pressing it is `confirm`, backing out
  //    (Escape / click-away) is `dismiss`.
  // A card/player/monster question stays asked: backing out re-arms it.
  const boardChoice = useMemo(() => {
    for (const window of view.pendingWindows) {
      if (!window.isYours || !window.options?.length) continue
      if (BOARD_CHOICES.has(window.type)) {
        const pairs = window.options.flatMap((option) => {
          const key = targetKeyForId(view, option)
          return key ? [{ key, option }] : []
        })
        if (pairs.length === window.options.length) return { window, pairs, dismiss: undefined }
      }
      // a yes/no about a board card that CANNOT be walked away from — the
      // optional ones (with `dismiss`) are the soft ask below, no dimming
      if (
        window.type === 'TaskChoice' &&
        window.options.includes('confirm') &&
        !isOptionalWindow(window)
      ) {
        const key = targetKeyForId(view, askedCardOf(window))
        if (key) return { window, pairs: [{ key, option: 'confirm' as unknown }], dismiss: undefined }
      }
    }
    return null
  }, [view])
  // the window this seat already answered (or dismissed) — never re-armed
  const answeredChoice = useRef<string | null>(null)
  // a cancel the code itself issued (window gone), not the player's dismiss
  const silentCancel = useRef(false)
  useEffect(() => {
    if (!boardChoice) {
      if (active?.source.startsWith('pendingWindow:')) {
        silentCancel.current = true
        cancel()
      }
      return
    }
    const { window, pairs, dismiss } = boardChoice
    const source = tkey.pendingWindow(window.windowId)
    if (active?.source === source || answeredChoice.current === window.windowId) return
    const answer = (choice: unknown) => {
      answeredChoice.current = window.windowId
      void run({ type: 'SubmitChoice', payload: { windowId: window.windowId, choice } })
    }
    begin({
      source,
      tone: 'choice',
      targets: pairs.map((pair) => pair.key),
      onPick: (key) => {
        const pair = pairs.find((candidate) => candidate.key === key)
        if (pair) answer(pair.option)
      },
      onCancel: () => {
        if (silentCancel.current) {
          silentCancel.current = false
          return
        }
        if (dismiss !== undefined) answer(dismiss)
      },
    })
    // `run` is recreated every render; the request only needs the window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardChoice, active, begin, cancel])
  // The OPTIONAL question of the moment ("roll on the hero you just
  // played?"): the hero wears a gold aura, pressing it says yes, the table
  // stays live, and any other action forfeits it (see `run`).
  const optionalAsk = view.pendingWindows.find(
    (window) => window.isYours && isOptionalWindow(window),
  )
  const askedCardId = optionalAsk ? askedCardOf(optionalAsk) : undefined
  // A choice of ACTION ("steal it instead of destroying it?"): a TaskChoice
  // whose options are labels rather than confirm/dismiss. Buttons, one per
  // label; the engine treats the last label as what silence does.
  const actionAsk = view.pendingWindows.find(
    (window) =>
      window.isYours &&
      window.type === 'TaskChoice' &&
      !!window.options?.length &&
      !window.options.includes('confirm') &&
      !window.options.includes('dismiss'),
  )
  const forfeit = async (): Promise<boolean> => {
    if (!optionalAsk) return true
    const result = await send({
      type: 'SubmitChoice',
      payload: { windowId: optionalAsk.windowId, choice: 'dismiss' },
    })
    return handleResult(result)
  }

  // what the gems' tooltip says while a question is open: the engine's
  // wording, else a yes/no's label ("RollOnPlayedHero" → "roll on played hero?")
  const question = (() => {
    const detail = (boardChoice?.window ?? optionalAsk)?.detail
    if (typeof detail?.question === 'string') return detail.question
    if (typeof detail?.confirms === 'string') {
      return `${detail.confirms.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}?`
    }
    return undefined
  })()

  const activate = (source: TargetKey) => {
    const [kind, a, b] = source.split(':')
    if (kind === 'mainDeck') {
      void run({ type: 'DrawCard', payload: {} })
      return
    }
    if (kind === 'monster') {
      const monsterId = view.monsterRow[Number(a)]?.id
      if (monsterId) void run({ type: 'AttackMonster', payload: { monsterId } })
      return
    }
    if (kind === 'hero') {
      const playerId = slots[a as PlayerId]
      const heroId = view.parties.find((party) => party.playerId === playerId)?.heroes[Number(b)]?.card.id
      if (!heroId) return
      if (optionalAsk && heroId === askedCardId) {
        // the hero the question is about: pressing it is "yes"
        void send({
          type: 'SubmitChoice',
          payload: { windowId: optionalAsk.windowId, choice: 'confirm' },
        }).then(handleResult)
        return
      }
      void run({ type: 'RollOnHero', payload: { heroId } })
      return
    }
    if (kind === 'leader') {
      const playerId = slots[a as PlayerId]
      const leaderId = view.parties.find((party) => party.playerId === playerId)?.leader.id
      if (leaderId) void run({ type: 'RollOnLeader', payload: { leaderId } })
      return
    }
    if (kind !== 'handCard') return

    const card = view.hand[Number(a)]
    if (!card) return
    if (card.type === 'Hero') {
      void run({ type: 'PlayHero', payload: { cardId: card.id } })
    } else if (card.type === 'Magic') {
      void run({ type: 'PlayMagic', payload: { cardId: card.id } })
    } else if (card.type === 'Item') {
      // MIRROR of the engine's equip rule (item-tasks.ts canEquip): a cursed
      // item is played AT anybody, a plain one only dresses your own; either
      // way the hero must be bare (HeroAlreadyEquipped)
      const cursed = 'cursed' in card && card.cursed === true
      const targets = view.parties.flatMap((party) => {
        const slot = (Object.entries(slots) as [PlayerId, string | null][]).find(([, id]) => id === party.playerId)?.[0]
        if (!slot) return []
        if (!cursed && party.playerId !== view.playerId) return []
        return party.heroes.flatMap((hero, index) =>
          hero.equippedItem ? [] : [tkey.hero(slot, index)],
        )
      })
      begin({
        source,
        targets,
        onPick: (target) => {
          const targetHeroId = idForTargetKey(view, target)
          if (targetHeroId) {
            void run({ type: 'PlayItem', payload: { cardId: card.id, targetHeroId } })
          }
        },
      })
    } else if (card.type === 'Modifier') {
      if (liveChallenge) {
        // A started challenge: aim at one of the two roll panels in the
        // overlay; the panel's side names whose roll the modifier lands on.
        const sideOf: Record<ChallengeRole, string> = {
          challenged: liveChallenge.defenderId,
          challenger: liveChallenge.challengerId,
        }
        begin({
          source,
          tone: 'reaction',
          targets: (['challenged', 'challenger'] as const).map((role) =>
            tkey.challengeRoll(role),
          ),
          onPick: (target) => {
            const role = target.split(':')[1] as ChallengeRole
            setModifierChoice({ card, targetPlayerId: sideOf[role] })
          },
        })
        return
      }
      const windows = view.pendingWindows.filter(
        (window) => window.type === 'Modifier' || window.type === 'Attack',
      )
      const pairs = windows.flatMap((window) => {
        const key = targetKeyForId(view, subjectIdOf(window))
        return key ? [{ key, window }] : []
      })
      begin({
        source,
        tone: 'reaction',
        targets: pairs.map((pair) => pair.key),
        onPick: (target) => {
          const pair = pairs.find((candidate) => candidate.key === target)
          if (pair) {
            setModifierChoice({
              card,
              targetPlayerId: pair.window.respondentId,
            })
          }
        },
      })
    } else if (card.type === 'Challenge') {
      const windows = view.pendingWindows.filter(
        (window) =>
          window.type === 'Challenge' &&
          window.cardId &&
          window.detail?.challenged !== true,
      )
      const pairs = windows.flatMap((window) => {
        const key = targetKeyForId(view, window.cardId)
        return key && window.cardId ? [{ key, window }] : []
      })
      begin({
        source,
        tone: 'reaction',
        targets: pairs.map((pair) => pair.key),
        onPick: (target) => {
          const contested = pairs.find((pair) => pair.key === target)?.window
          if (contested?.cardId) {
            void run({
              type: 'Challenge',
              payload: { cardId: card.id, targetedCardId: contested.cardId },
            })
          }
        },
      })
    }
  }

  return (
    <div
      className={`board-root relative h-screen w-screen overflow-hidden bg-zinc-950${
        active ? ` targeting${active.tone === 'reaction' ? ' reaction-targeting' : ''}` : ''
      }${active?.tone === 'choice' ? ' choice-targeting' : ''}${challengeOpen ? ' challenge-open' : ''}`}
      onClick={active ? cancel : undefined}
    >
      <div
        className="dimmable pointer-events-none absolute inset-0"
        style={{ backgroundImage: `url("${TABLE_BG}")`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      />
      <div
        className="board-stage absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 [container-type:size]"
        style={{ width: 'min(100vw, calc(100vh * 16 / 9))', height: 'min(100vh, calc(100vw * 9 / 16))' }}
      >
        <div
          className="absolute z-20 -translate-x-1/2 -translate-y-1/2 has-[:hover]:z-[100]"
          style={{ left: `calc(50% + ${CENTER_DX}cqh)`, top: `calc(50% + ${CENTER_DY}cqh)`, height: `${CENTER_H}cqh`, width: `${CENTER_H * ASPECT.center}cqh` }}
        >
          <img src={FRAMES.center} alt="" aria-hidden draggable={false} className="dimmable pointer-events-none absolute inset-0 h-full w-full object-fill" />
          <CenterArena
            view={view}
            discardCards={discardCards}
            discardPlayable={discardPlayable}
            enemyIds={enemyIds}
            passiveIds={passiveIds}
            flags={flags}
            activate={activate}
            onOpenDiscard={() => setDiscardOpen(true)}
          />
        </div>

        {(Object.keys(PLAYERS) as PlayerId[]).map((slot) => {
          const playerId = slots[slot]
          if (!playerId) return null
          const player = view.seats.find((seat) => seat.playerId === playerId)
          const party = view.parties.find((entry) => entry.playerId === playerId)
          if (!player || !party) return null
          const layout = PLAYERS[slot]
          const isMine = playerId === view.playerId
          return (
            <React.Fragment key={slot}>
              <Widget def={layout.heroes} anchor={layout.anchor}>
                <HeroRow
                  heroes={party.heroes}
                  seat={HERO_SEAT[slot]}
                  playable={party.heroes.map(
                    (hero, index) =>
                      (isMine && !!flags.heroes[index]) ||
                      reactionTargetIds.has(hero.card.id),
                  )}
                  asked={party.heroes.map((hero) => isMine && hero.card.id === askedCardId)}
                  enemy={party.heroes.map((hero) => enemyIds.has(hero.card.id))}
                  passive={party.heroes.map((hero) => passiveIds.has(hero.card.id))}
                  itemPassive={party.heroes.map(
                    (hero) => !!hero.equippedItem && passiveIds.has(hero.equippedItem.id),
                  )}
                  itemEnemy={party.heroes.map(
                    (hero) => !!hero.equippedItem && enemyIds.has(hero.equippedItem.id),
                  )}
                  itemPlayable={party.heroes.map(
                    (hero) =>
                      !!hero.equippedItem &&
                      reactionTargetIds.has(hero.equippedItem.id),
                  )}
                  targetKeyFor={(index) => tkey.hero(slot, index)}
                  itemTargetKeyFor={(index) => tkey.item(slot, index)}
                  onActivateFor={isMine ? (index) => activate(tkey.hero(slot, index)) : undefined}
                />
              </Widget>
              <Widget def={layout.leader} anchor={layout.anchor}>
                <LeaderWithCards
                  slot={slot}
                  party={party}
                  revealSide={layout.anchor === 'right' ? 'left' : 'right'}
                  playable={isMine && flags.leader}
                  passive={passiveIds.has(party.leader.id)}
                  enemy={enemyIds.has(party.leader.id)}
                  onActivate={isMine && flags.leader ? () => activate(tkey.leader(slot)) : undefined}
                  origin={LEADER_ZOOM_ORIGIN[layout.anchor]}
                  // a zoomed leader is exactly as tall as a zoomed monster
                  zoom={MONSTER_ZOOMED_H / layout.leader.h}
                />
              </Widget>
              <Widget
                def={layout.cardback}
                anchor={layout.anchor}
                zClass="z-40"
                // during a challenge the local hand is part of the bright
                // layer — raised above the overlay's click shield (z-140) —
                // and every seat's hand count stays readable (modifier fuel)
                zIndex={challengeOpen && isMine ? 160 : undefined}
                dimExempt={challengeOpen}
              >
                {isMine ? (
                  <PlayerHand
                    cards={view.hand.map((card) => artFor(card).url)}
                    anchorCenterCqw={82}
                    playable={flags.hand}
                    onActivateCard={(index) => activate(tkey.handCard(index))}
                  >
                    <HandCount count={view.hand.length} playable={hasPlayableHandCard} targetKey={tkey.handStack(slot)} />
                  </PlayerHand>
                ) : (
                  <HandCount count={player.handCount} targetKey={tkey.handStack(slot)} />
                )}
              </Widget>
            </React.Fragment>
          )
        })}

        {/* the table's one line of words — the roll as it stands, the
            question being asked, whose turn — as a tooltip on the gems,
            since the owner dropped the turn scroll (2026-09-03) */}
        <HudWidget def={HUD_WIDGETS.challengeButton} aspect={3}>
          <DevButton
            label="Challenge"
            enabled={!!liveChallenge && overlayHidden}
            onClick={() => setOverlayHidden(false)}
          />
        </HudWidget>
        {FAKE_SERVER && (
          <HudWidget def={HUD_WIDGETS.restartButton} aspect={3}>
            <DevButton
              label="Restart test"
              enabled
              onClick={() => window.location.assign('/?autostart=1')}
            />
          </HudWidget>
        )}
        <HudWidget
          def={HUD_WIDGETS.actionPoints}
          aspect={HUD_ASPECT.actionFrame}
          title={
            liveRoll
              ? rollLabel(liveRoll, view)
              : boardChoice
                ? `choose: ${typeof question === 'string' ? question : boardChoice.window.type}`
                : `${
                    view.currentPlayerId === view.playerId ? 'your turn' : `${current?.name ?? 'player'}'s turn`
                  } · ${current?.actionPoints ?? mine?.actionPoints ?? 0} AP${view.busy ? ' · busy' : ''}`
          }
        >
          <ActionPoints current={mine?.actionPoints ?? 0} />
        </HudWidget>
        <HudWidget def={HUD_WIDGETS.endTurn} aspect={HUD_ASPECT.button}>
          {view.phase === 'Concluded' ? (
            // once the game is over the End Turn slot is the Exit button
            // (same art until the owner's Exit art lands)
            <ImageButton src={HUD.endTurn} label="Exit" enabled onClick={leaveGame} />
          ) : flags.passable || flags.waitingOnPass ? (
            // a roll or a challenge is open: nobody can end a turn, so the slot
            // gives the window up instead (PassWindow) — one window per press,
            // and once this seat has passed them all it waits for the others
            <ImageButton
              src={HUD.skipReaction}
              label={flags.passable ? 'Skip reaction' : 'Waiting for the other players'}
              enabled={!!flags.passable}
              onClick={() => void forfeitWindow()}
            />
          ) : (
            <ImageButton
              src={HUD.endTurn}
              label="End Turn"
              enabled={flags.endTurn}
              onClick={() => void run({ type: 'EndTurn', payload: {} })}
            />
          )}
        </HudWidget>
        <HudWidget def={HUD_WIDGETS.redraw} aspect={HUD_ASPECT.button}>
          <ImageButton
            src={HUD.redraw}
            label="Redraw"
            enabled={flags.redraw}
            onClick={() => void run({ type: 'ReDraw', payload: {} })}
          />
        </HudWidget>

        <PendingWindows
          view={view}
          hiddenWindowIds={[
            ...(boardChoice ? [boardChoice.window.windowId] : []),
            ...(optionalAsk && askedCardId && targetKeyForId(view, askedCardId)
              ? [optionalAsk.windowId]
              : []),
          ]}
          onSubmit={(windowId, choice) =>
            void run({ type: 'SubmitChoice', payload: { windowId, choice } })
          }
        />
        <DiceRoll roll={dice} tone={diceTone} />
        <ChallengeWindow
          hidden={overlayHidden}
          onHide={() => setOverlayHidden(true)}
          onForfeit={flags.passable ? () => void forfeitWindow() : undefined}
        />

        <RevealedCards cards={view.revealedCards ?? []} />

        {discardOpen && (
          <DiscardPileModal
            cards={discardCards}
            onClose={() => setDiscardOpen(false)}
          />
        )}

        {actionAsk && (
          <div className="absolute inset-0 z-[180] flex items-center justify-center bg-black/60">
            <div className="rounded-[.6cqw] border border-amber-400/70 bg-zinc-950 p-[1cqw] text-center text-amber-100 shadow-2xl">
              <div className="mb-[.7cqh] font-heading text-[.9cqw] text-amber-300">
                {typeof actionAsk.detail?.question === 'string' ? actionAsk.detail.question : 'Choose'}
              </div>
              <div className="flex justify-center gap-[.8cqw]">
                {actionAsk.options!.map((option) => (
                  <button
                    key={String(option)}
                    type="button"
                    className="rounded-[.45cqw] border border-amber-400/60 bg-amber-950/70 px-[1cqw] py-[.6cqh] font-heading text-[.8cqw] uppercase tracking-wider text-amber-100 transition hover:border-amber-200 hover:brightness-125"
                    onClick={() =>
                      void run({
                        type: 'SubmitChoice',
                        payload: { windowId: actionAsk.windowId, choice: option },
                      })
                    }
                  >
                    {String(option)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {modifierChoice && (
          <div
            className="absolute inset-0 z-[180] flex items-center justify-center bg-black/60"
            onClick={() => setModifierChoice(null)}
          >
            <div
              className="rounded-[.6cqw] border border-amber-400/70 bg-zinc-950 p-[1cqw] text-center text-amber-100 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-[.7cqh] font-heading text-[.9cqw] text-amber-300">
                Choose modifier value
              </div>
              {/* one copy of the card per printed value, drawn with that
                  value's own art (Modifier -2.png / +2.png …): the minus
                  side on the left, the plus side on the right */}
              <div className="flex justify-center gap-[1cqw]">
                {[...modifierChoice.card.values].sort((a, b) => a - b).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`Apply ${value > 0 ? '+' : ''}${value} modifier`}
                    className="group rounded-[.45cqw] border border-amber-400/60 bg-amber-950/70 p-[.35cqw] transition hover:-translate-y-[.35cqh] hover:border-amber-200 hover:brightness-125"
                    onClick={() => {
                      const selection = modifierChoice
                      setModifierChoice(null)
                      void run({
                        type: 'ApplyModifier',
                        payload: {
                          cardId: selection.card.id,
                          targetPlayerId: selection.targetPlayerId,
                          value,
                        },
                      })
                    }}
                  >
                    <img
                      src={boardModifierUrl(`${value > 0 ? '+' : ''}${value}`)}
                      alt={`${value > 0 ? '+' : ''}${value}`}
                      draggable={false}
                      className="h-[25cqh] rounded-[.35cqw] object-contain shadow-xl"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {view.phase === 'Concluded' && !resultHidden && (
          // press the backdrop to look at the final table (nothing is sent);
          // Exit (the End Turn slot) leaves the game
          <div
            className="absolute inset-0 z-[200] flex items-center justify-center bg-black/75"
            onClick={() => setResultHidden(true)}
          >
            <div
              className="rounded-[.7cqw] border border-amber-400/70 bg-zinc-950/95 p-[1.6cqw] text-center shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 className="font-heading text-[2cqw] text-amber-300">
                {view.winnerId === view.playerId
                  ? 'You win'
                  : `${view.seats.find((seat) => seat.playerId === view.winnerId)?.name ?? 'Nobody'} wins`}
              </h2>
              <p className="mt-[.35cqh] text-[.8cqw] text-stone-200">
                Game over. Press anywhere to look at the final table; Exit leaves.
              </p>
              <button
                type="button"
                className="mt-[1.2cqh] rounded border border-amber-400 bg-amber-800 px-[1.2cqw] py-[.55cqh] font-heading text-[.8cqw] uppercase tracking-widest text-white hover:bg-amber-700"
                onClick={leaveGame}
              >
                Exit
              </button>
            </div>
          </div>
        )}
        {toast && (
          <div role="alert" className="absolute bottom-[2cqh] left-1/2 z-[190] -translate-x-1/2 rounded-[0.35cqw] border border-red-300/50 bg-zinc-950/90 px-[0.8cqw] py-[0.45cqh] text-[0.72cqw] text-red-100 shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}
