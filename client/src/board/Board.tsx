import AssetImage, { useBackgroundImage } from '../loading/AssetImage'
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
  PlayerDef,
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
import ImageButton from './ImageButton'
import DiceRoll from './DiceRoll'
import TurnTimer from './TurnTimer'
import CardReactionTimer from './CardReactionTimer'
import ChallengeWindow from './ChallengeWindow'
import ModifierWindow from './ModifierWindow'
import SettingsMenu from './SettingsMenu'
import { auraClasses, BoardSettingsProvider, useBoardSettings } from './boardSettings'
import { ChallengeProvider, ChallengeRole, useChallenge } from './challenge'
import {
  liveRollOf,
  rollLabel,
  rollOutcome,
  subjectIdOf,
  useLiveDice,
  targetSeatsOf,
} from './liveRoll'
import ValueArt from './ValueArt'
import { useChallengeSync } from './useChallengeSync'
import { derivePlayable, equipTargets, holdsAnswer, isFreeAction, isOptionalWindow, reactionCardType, reactionRevision } from './playable'
import {
  TargetingProvider,
  TargetKey,
  tkey,
  useTargetable,
  useTargeting,
} from './targeting'
import { useGameView, useGameInfo, useGameLog } from '../state/game'
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
import { nameOf, slotsFor } from './seats'
import { cardById, discardCardsForView, idForTargetKey, targetKeyForId } from './viewTargets'
import { useHoverZoom } from './useHoverZoom'
import PendingWindows, { Countdown } from './PendingWindows'
import ChoicePrompt, { choiceInstruction, openChoice, ReactionPrompt } from './choicePrompt'
import DiscardPileModal from './DiscardPileModal'
import RevealedCards from './RevealedCards'
import { useAudio } from '../audio/AudioProvider'
import { useGameAudio } from '../audio/useGameAudio'
import { backedRole, lazyModifierValue, lazyMove, useLazyChoice } from './lazyChoice'

function Widget({
  def,
  anchor,
  zClass = 'z-20',
  zIndex,
  dimExempt = false,
  turn = false,
  children,
}: {
  def: WidgetDef
  anchor: Anchor
  zClass?: string
  /** inline z (beats the classes) — the hand above the challenge shield */
  zIndex?: number
  /** keep this widget bright while a challenge dims the board */
  dimExempt?: boolean
  /** it is this seat's turn: the painted frame glows green */
  turn?: boolean
  children?: React.ReactNode
}) {
  const inset = INSET[def.kind]
  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${zClass} has-[.is-zoomed]:z-[120]${
        dimExempt ? ' dim-exempt' : ''
      }`}
      style={{
        height: `${def.h}cqh`,
        width: `${widthCqh(def)}cqh`,
        zIndex,
        ...positionStyle(anchor, def.dx, def.dy),
      }}
    >
      <AssetImage
        src={FRAMES[def.kind]}
        alt=""
        aria-hidden
        draggable={false}
        className={`board-felt dimmable absolute inset-0 h-full w-full object-fill${
          turn ? ' turn-frame-aura' : ''
        }`}
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
  const hz = useHoverZoom<HTMLDivElement>(undefined, undefined, { stickyBounds: 'rest' })
  const target = useTargetable(targetKey, onActivate)
  const zoomable = zoom !== undefined && !(target.targeting && target.mode === 'dimmed')
  const art = artFor(card)
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        ref={zoomable ? hz.ref : undefined}
        className={`select-none rounded-[0.3cqw] shadow-[0.15cqw_0.3cqw_0.8cqw_rgba(0,0,0,0.7)] transition-transform duration-150 ${
          stretch ? 'relative h-full w-full' : 'relative h-[90%] w-[90%]'
        }${zoomable && hz.active ? ' is-zoomed' : ''}${enemy ? ' enemy-aura card-aura-sm' : playable ? ' card-aura card-aura-sm' : passive ? ' passive-aura card-aura-sm' : ''} ${target.className}`}
        style={{
          transformOrigin: origin,
          transform: zoomable && hz.active ? `scale(${zoom})` : undefined,
        }}
        onClick={target.onClick}
        onMouseEnter={zoomable ? hz.onMouseEnter : undefined}
        onMouseLeave={zoomable ? hz.onMouseLeave : undefined}
        onContextMenu={zoomable ? hz.onContextMenu : undefined}
      >
        <AssetImage src={art.url} alt={alt ?? card.name} draggable={false} className="h-full w-full rounded-[0.3cqw] object-fill" />
        <CardReactionTimer cardId={card.id} zoomed={zoomable && hz.active} />
      </div>
    </div>
  )
}

/** Each slain-monster trophy covers at least a tenth of the one before it. */
const TROPHY_OVERLAP = 0.1
/** …and at most this much of it: a strip of every trophy always shows. */
const TROPHY_MIN_STEP = 0.3

/** The stage is 16:9: its width in cqh. */
const STAGE_W_CQH = (100 * 16) / 9

/**
 * How far a seat's trophies may fan, in TROPHY WIDTHS from the leader's
 * centre: the felt between the leader and the stage edge on the reveal
 * side, over the width of the leader's inner window (the trophies' box).
 */
function trophyRoom(layout: PlayerDef, revealSide: 'left' | 'right'): number {
  const { anchor, leader } = layout
  const cx =
    anchor === 'left' ? leader.dx : anchor === 'right' ? STAGE_W_CQH - leader.dx : STAGE_W_CQH / 2 + leader.dx
  const room = revealSide === 'right' ? STAGE_W_CQH - cx : cx
  return room / (widthCqh(leader) * INSET.leader.w)
}

/**
 * A party leader with its slain monsters tucked behind it. The leader zooms
 * on hover like a hero (`useHoverZoom`, capped by the caller so the enlarged
 * card stays inside the stage); while zoomed the trophies fan out beside it
 * at the SAME size, the first flush against it and each next one a card
 * step further. The step shrinks as trophies pile up so the fan always fits
 * the felt (`room`), the way the hero row overlaps from five cards on —
 * each covering the edge of the one under it (the owner, 2026-09-05). A
 * trophy that is a pick target while the leader is at rest steps out at its
 * own size instead.
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
  room,
  onActivate,
}: {
  slot: PlayerId
  party: PartyView
  origin: string
  revealSide: 'left' | 'right'
  /** felt on the reveal side, in trophy widths from the leader's centre */
  room: number
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
  const hz = useHoverZoom<HTMLDivElement>(undefined, getTrophies)
  const dimmed = leaderTarget.targeting && leaderTarget.mode === 'dimmed'
  const zoomed = hz.active && !dimmed
  const trophyScale = zoom
  // centre-to-centre distances in trophy widths: inner edges touching the
  // zoomed leader (minus a hair, glued), then one step each — a tenth
  // overlapped, or as much more as it takes for the last one to stay on
  // the felt (never past TROPHY_MIN_STEP: a strip of each always shows)
  const firstShift = (zoom + trophyScale) / 2 - 0.12
  const count = party.monsters.length
  const fitStep = count > 1 ? (room - firstShift - trophyScale / 2 - 0.5) / (count - 1) : Infinity
  const step = Math.max(trophyScale * TROPHY_MIN_STEP, Math.min(trophyScale * (1 - TROPHY_OVERLAP), fitStep))

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
      <div
        ref={hz.ref}
        className={`absolute inset-0 z-20 h-full w-full select-none rounded-[0.3cqw] object-fill shadow-[0.15cqw_0.3cqw_0.8cqw_rgba(0,0,0,0.7)] transition-transform duration-[120ms] ease-out ${
          zoomed ? 'is-zoomed ' : ''
        }${
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
      >
        <AssetImage src={leaderArt.url} alt={party.leader.name} draggable={false} className="h-full w-full rounded-[0.3cqw] object-fill" />
        <CardReactionTimer cardId={party.leader.id} zoomed={zoomed} />
      </div>
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
      <AssetImage
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
      className="absolute z-30 -translate-x-1/2 -translate-y-1/2 has-[.is-zoomed]:z-[120]"
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
          <AssetImage
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
          <div key={card.id} className="absolute inset-0" style={{ transform: pileJitter(index, top) }}>
          <AssetImage
            src={art.url}
            alt={top ? `${card.name}, discard top` : ''}
            aria-hidden={!top}
            draggable={false}
            className={`absolute inset-0 h-full w-full select-none rounded-[0.3cqw] object-contain shadow-[0.1cqw_0.2cqw_0.5cqw_rgba(0,0,0,0.6)]${
              top && enemy ? ' enemy-aura' : playable && top ? ' card-aura' : ''
            }`}
          />
          {top && <CardReactionTimer cardId={card.id} />}
          </div>
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
  aboveChallenge = false,
  yields = false,
  def,
  aspect,
  title,
  children,
}: {
  aboveChallenge?: boolean
  /** stands down while the hand fan is open or a card is zoomed (index.css) */
  yields?: boolean
  def: HudDef
  aspect: number
  title?: string
  children: React.ReactNode
}) {
  return (
    <div
      // z-[110] sits BETWEEN the board's resting layers (z-20/30/40) and its
      // hover lift (z-[120] on the centre wrapper, every widget and every deck
      // slot). Both halves of the owner's rule, 2026-09-07: a HUD button is not
      // swallowed by the wooden centre it sits on, and it does not paint over
      // a card that has been zoomed — hovering is what zooms, and the hover
      // lift is the band that carries the zoom.
      className={`absolute -translate-x-1/2 -translate-y-1/2${yields ? ' hud-yield' : ''} ${aboveChallenge ? 'dim-exempt z-[160]' : 'z-[110]'}`}
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
      <AssetImage src={HUD.actionFrame} alt="" aria-hidden className="dimmable absolute inset-0 h-full w-full object-fill" />
      {AP_SLOT_X.map((x, index) => (
        <AssetImage
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

/**
 * Whose party this is, written beside their leader — ABOVE it for the two side
 * seats, BELOW it for the top seat, so the name never sits off the stage
 * (the owner, 2026-09-07). The viewer is not named: they know.
 */
function SeatName({ name, anchor }: { name: string; anchor: Anchor }) {
  const below = anchor === 'top'
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 ${
        below ? 'top-full mt-[0.4cqh]' : 'bottom-full mb-[0.4cqh]'
      } truncate text-center font-heading text-[1.05cqw] uppercase tracking-[0.08cqw] text-amber-100 drop-shadow-[0_0.1cqw_0.25cqw_rgba(0,0,0,0.95)]`}
    >
      {name}
    </div>
  )
}

/** Choice windows answered by pressing a glowing card on the board. */
const BOARD_CHOICES = new Set(['CardChoice', 'PlayerChoice', 'MonsterChoice'])

/** height (cqh) of the Draw / Forfeit answers beside a question card */
const ANSWER_H = 11

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
    <BoardSettingsProvider>
      <TargetingProvider>
        <ChallengeProvider>
          <BoardInner onLeave={onLeave} />
        </ChallengeProvider>
      </TargetingProvider>
    </BoardSettingsProvider>
  )
}

/**
 * A press on the FELT — the table, a painted frame, or the bare stage — as
 * opposed to a press on anything the player can act with. What closes a hand
 * held open by the click-to-open setting (the owner, 2026-09-07); the felt and
 * every frame carry `board-felt` and take pointer events for exactly this.
 */
function pressedFelt(event: React.MouseEvent): boolean {
  const target = event.target as HTMLElement
  return (
    target.classList.contains('board-felt') ||
    target.classList.contains('board-stage') ||
    target.classList.contains('board-root')
  )
}

function BoardInner({ onLeave }: { onLeave?: () => void }) {
  const { settings } = useBoardSettings()
  // Click-to-open hand: the board owns whether it is held open, because what
  // closes it is a press on the FELT, which only the root sees.
  const [handHeldOpen, setHandHeldOpen] = useState(false)
  const tableBackground = useBackgroundImage(TABLE_BG)
  const view = useGameView()
  const info = useGameInfo()
  const log = useGameLog()
  const { playSound } = useAudio()
  useGameAudio(view, log)
  const send = useSend()
  const flags = derivePlayable(view)
  const [localPasses, setLocalPasses] = useState<Record<string, string>>({})
  const passableWindows = view.pendingWindows.filter((window) =>
    flags.passableWindows.includes(window.windowId) &&
    localPasses[window.windowId] !== reactionRevision(window),
  )
  useEffect(() => {
    setLocalPasses((passes) => {
      const remaining = Object.entries(passes).filter(([id, revision]) =>
        view.pendingWindows.some((window) => window.windowId === id &&
          reactionRevision(window) === revision &&
          !(Array.isArray(window.detail?.passedBy) && window.detail?.passedBy.includes(view.playerId))),
      )
      return remaining.length === Object.keys(passes).length ? passes : Object.fromEntries(remaining)
    })
  }, [view])
  const discardCards = discardCardsForView(view)
  const slots = slotsFor(view)
  const { active, begin, cancel } = useTargeting()
  // The two dramatic windows, driven from the view: the dice on the felt for
  // a hero / leader / attack roll, the paused-game overlay for a challenge.
  const challenge = useChallenge()
  const liveChallenge = useChallengeSync(view)
  // The overlay can be put away (click its backdrop) to look at the table,
  // and brought back with the window button beside the discard pile. A new challenge
  // always shows itself.
  const [overlayHidden, setOverlayHidden] = useState(false)
  const liveChallengeId = liveChallenge?.windowId
  useEffect(() => {
    setOverlayHidden(false)
  }, [liveChallengeId])
  // A question put to THIS seat takes the stage back from BOTH overlays: a
  // challenge on stage while you are being asked to discard is a window you
  // cannot act on standing over the one you must (the owner, 2026-09-08 —
  // Bloodwing asks the challenger for a card mid-contest). The contest comes
  // back the moment the question is answered; nothing is lost, because the
  // engine will not settle a challenge while a question stands after it
  // (ChallengeWindow.resolve) and restarts its clock when one does
  // (GameState.restartWindowsOutside).
  const myQuestionOpen = !!openChoice(view)
  const challengeOpen = !!challenge.active && !overlayHidden && !myQuestionOpen
  const liveRoll = liveRollOf(view)
  const dice = useLiveDice(view, liveRoll)
  // Every roll takes the stage (ModifierWindow) the moment it is made
  // (the owner, 2026-09-06), put away and brought back exactly like the
  // challenge overlay; a challenge on stage takes precedence. A question of
  // MINE holds it back (myQuestionOpen, below), which is what keeps a roll's
  // window off the choice that roll opened (Fury Knuckle).
  const modifiedRoll = liveRoll
  const [manuallyOpenedRollId, setManuallyOpenedRollId] = useState<string | null>(null)
  const modifierRoll = modifiedRoll ?? (liveRoll?.windowId === manuallyOpenedRollId ? liveRoll : null)
  // A question put to THIS seat outranks the roll it stands over, always
  // (the owner, 2026-09-08): a choice is the thing the table is waiting on,
  // and the roll's window does not open over it even when a modifier lands.
  // The engine agrees — a roll will not settle while a question stands after
  // it (ModifiableRollWindow.resolve), and every clock outside the frame that
  // just answered is restarted (GameState.restartWindowsOutside), so nothing
  // is lost by showing the question first.
  //
  // `openChoice` is the same test the question's own banner uses, so the two
  // can never disagree about whether one is standing.
  // Put away by hand, and brought back by the window button. A question of
  // mine overrides both: it is a gate, not a preference.
  const [modifierHidden, setModifierHidden] = useState(false)
  const modifiedRollId = modifiedRoll?.windowId
  useEffect(() => {
    setModifierHidden(false)
  }, [modifiedRollId])
  const modifierOpen =
    !!modifierRoll && !modifierHidden && !challengeOpen && !myQuestionOpen
  const stageOpen = challengeOpen || modifierOpen
  const [toast, setToast] = useState<string | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [modifierChoice, setModifierChoice] = useState<{
    card: ModifierCardData
    /** Whose roll, in a started challenge only — a roll has one and the server names it. */
    targetPlayerId?: string
  } | null>(null)
  const mine = view.seats.find((seat) => seat.playerId === view.playerId)
  const current = view.seats.find((seat) => seat.playerId === view.currentPlayerId)
  const hasPlayableHandCard = flags.hand.some(Boolean)
  // While a reaction window is up the hand opens itself and shows ONLY the
  // cards that answer it — the modifiers on a roll, the challenges on a play
  // (the owner, 2026-09-07). Indices are untouched: a hidden card keeps its
  // slot in every flag array and its own targeting key.
  // A reaction window narrows the fan to the cards that answer it — but only
  // opens it, and only lifts it over the dim, when this seat HOLDS one. An
  // empty fan floating above a dimmed table says you may act when you cannot
  // (the owner, 2026-09-08).
  const canAnswer = holdsAnswer(view)
  const answersWith = reactionCardType(view)
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
  //  - pink: every card carrying a PASSIVE (`view.passiveCardIds`), all game
  //    long. The owner's rule, 2026-09-07: gold = can pick, green = can play,
  //    pink = this one has a standing rule. Pink is the quietest of the four,
  //    so red and green still win the card they are on.
  const enemyIds = new Set<string>()
  for (const window of view.pendingWindows) {
    if (window.type !== 'Modifier' && window.type !== 'Attack' && window.type !== 'Challenge') continue
    if (window.respondentId !== view.playerId) {
      const subject = subjectIdOf(window)
      if (subject) enemyIds.add(subject)
    }
  }
  // Pink = "this card's rule works with nobody playing anything", every one
  // of them, all game long (the owner, 2026-09-07: always, leaders and won
  // monsters included). The server names them off the ability registry —
  // behaviour never reaches card data, so nothing here could work it out.
  const passiveIds = new Set(view.passiveCardIds)
  // The seats a roll's effect has chosen. Only the VIEWER's own is drawn now:
  // the screen's red rim says it, and the widget frames used to say the same
  // thing a second time (the owner, 2026-09-07: the rim is enough).
  const targetedHands = new Set<string>()
  const targetedParties = new Set<string>()
  for (const window of view.pendingWindows) {
    if (window.type !== 'Modifier' && window.type !== 'Attack') continue
    for (const seat of targetSeatsOf(window.detail?.targets)) {
      if (seat.zone === 'Party') targetedParties.add(seat.playerId)
      else targetedHands.add(seat.playerId)
    }
  }
  // A roll's effect has chosen YOU: red down both sides of the screen, so it
  // reads even with the modifier window on the stage (the owner, 2026-09-07).
  const targeted =
    targetedHands.has(view.playerId) || targetedParties.has(view.playerId)
  // The screen rim is the VIEWER's turn and nothing else — somebody else's
  // turn is said by their own frames instead (the owner, 2026-09-08).
  const myTurn = view.phase === 'Turns' && view.currentPlayerId === view.playerId
  const diceOutcome = liveRoll ? rollOutcome(liveRoll, view) : 'none'

  // A value being picked loses its roll when the window lapses
  // mid-resolution: the dialog goes with it. The test is a roll that takes
  // modifiers, not "some window is open" — an unstarted challenge can
  // outlive the roll the modifier was for.
  const modifierTargetGone =
    !!modifierChoice &&
    !view.pendingWindows.some(
      (window) =>
        window.type === 'Modifier' ||
        window.type === 'Attack' ||
        (window.type === 'Challenge' && window.detail?.challenged === true),
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
    if (passableWindows.length === 0) return false
    // A non-final pass emits no engine event/snapshot. Keep its acknowledgement
    // locally until the server confirms it or a changed roll reopens reactions.
    const attempts = passableWindows.map((window) => [window.windowId, reactionRevision(window)] as const)
    setLocalPasses((passes) => ({ ...passes, ...Object.fromEntries(attempts) }))
    for (let index = 0; index < attempts.length; index++) {
      const [windowId] = attempts[index]
      let result: CommandResult
      try {
        result = await send({ type: 'PassWindow', payload: { windowId } })
      } catch {
        result = { accepted: false, error: 'InternalError' }
      }
      if (!handleResult(result)) {
        setLocalPasses((passes) => {
          const remaining = { ...passes }
          for (const [id, revision] of attempts.slice(index)) {
            if (remaining[id] === revision) delete remaining[id]
          }
          return remaining
        })
        return false
      }
    }
    playSound('skipReaction')
    return true
  }

  /**
   * A modifier card played on the roll of the moment — the server names the
   * target on a roll; a started challenge has two rolls and `targetPlayerId`
   * says which. One printed value: it lands as it is, nothing to choose
   * (the owner, 2026-09-05); two: the value dialog, unless the caller has
   * already chosen — Lazy Choice decides the number and the side together,
   * so there is nothing left to ask.
   */
  const playModifier = (
    card: ModifierCardData,
    targetPlayerId?: string,
    value?: number,
  ) => {
    const only = value ?? (card.values.length === 1 ? card.values[0] : undefined)
    if (only !== undefined) {
      void run({
        type: 'ApplyModifier',
        payload: { cardId: card.id, value: only, ...(targetPlayerId ? { targetPlayerId } : {}) },
      })
      return
    }
    setModifierChoice({ card, targetPlayerId })
  }

  const run = async (command: GameCommandInput): Promise<boolean> => {
    // another action while an optional question is open = "no, thanks":
    // the engine is busy until it is answered, so decline it first
    if (command.type !== 'SubmitChoice' && !(await forfeit())) return false
    if (command.type === 'SubmitChoice') answeredHere(command.payload.windowId)
    const result = await send(command)
    return handleResult(result)
  }

  // A question this seat has just answered. The snapshot that takes the
  // window away is a round trip off, and until it lands the overlay would
  // still be standing over the board — an answered question leaves the
  // screen at once (the owner, 2026-09-08). Ids are dropped again as soon as
  // the table stops reporting the window, so this never grows.
  // SHIFT takes a sequence back from Lazy Choice (the owner, 2026-09-08).
  // Press an action with shift down and nothing is answered for you until the
  // table is quiet again — the whole modifier exchange, not the one window,
  // because a sequence is what a player means to play out by hand.
  //
  // The flag is read at mousedown in the CAPTURE phase rather than threaded
  // through `onActivate`: every board press already goes through one root,
  // and the alternative is a MouseEvent carried down every targetable.
  const shiftHeld = useRef(false)
  const [lazySuspended, setLazySuspended] = useState(false)
  const tableQuiet = view.pendingWindows.length === 0 && !view.busy
  useEffect(() => {
    if (tableQuiet) setLazySuspended(false)
  }, [tableQuiet])

  // Decided HERE, in the render that would otherwise draw the window: a
  // question Lazy Choice is about to submit is never put on screen at all.
  const lazyPlan = settings.lazyChoice && !lazySuspended ? lazyMove(view) : null
  const lazyAnswering = lazyPlan?.kind === 'submit' ? lazyPlan.windowId : null

  const [submitted, setSubmitted] = useState<string[]>([])
  const answeredHere = useCallback(
    (windowId: string) =>
      setSubmitted((was) => (was.includes(windowId) ? was : [...was, windowId])),
    [],
  )
  useEffect(() => {
    setSubmitted((was) => {
      if (was.length === 0) return was
      const open = new Set(view.pendingWindows.map((window) => window.windowId))
      const left = was.filter((id) => open.has(id))
      return left.length === was.length ? was : left
    })
  }, [view.pendingWindows])
  /** a window still worth putting on screen — not one we have just answered */
  const unanswered = (window: PendingWindowView) =>
    !submitted.includes(window.windowId) && window.windowId !== lazyAnswering

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
      if (!unanswered(window)) continue
      if (BOARD_CHOICES.has(window.type)) {
        const pairs = window.options.flatMap((option) => {
          const key = targetKeyForId(view, option)
          return key ? [{ key, option }] : []
        })
        // a pick from the discard pile is a board choice too: the pile glows,
        // opening it shows the pickable cards gold (the owner, 2026-09-05)
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
    // The reaction cards in the hand stay playable under the question: a
    // challenge or modifier against the play that is asking must not wait
    // for the answer (the owner, 2026-09-05). Pressing one starts the reaction;
    // the question re-arms once it is done.
    const live = view.hand.flatMap((card, index) =>
      flags.hand[index] && (card.type === 'Challenge' || card.type === 'Modifier')
        ? [tkey.handCard(index)]
        : [],
    )
    const revision = JSON.stringify([pairs, live])
    if ((active?.source === source && active.revision === revision) || answeredChoice.current === window.windowId) return
    const answer = (choice: unknown) => {
      answeredChoice.current = window.windowId
      void run({ type: 'SubmitChoice', payload: { windowId: window.windowId, choice } })
    }
    begin({
      source,
      tone: 'choice',
      effectSource: targetKeyForId(view, window.detail?.sourceCardId) ?? undefined,
      revision,
      live,
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
    (window) => window.isYours && unanswered(window) && isOptionalWindow(window),
  )
  const askedCardId = optionalAsk ? askedCardOf(optionalAsk) : undefined
  // A choice of ACTION ("steal it instead of destroying it?"): a TaskChoice
  // whose options are labels rather than confirm/dismiss. Buttons, one per
  // label; the engine treats the last label as what silence does.
  const actionAsk = view.pendingWindows.find(
    (window) =>
      window.isYours &&
      unanswered(window) &&
      window.type === 'TaskChoice' &&
      !!window.options?.length &&
      !window.options.includes('confirm') &&
      !window.options.includes('dismiss'),
  )
  // A choice of VALUE the engine asks (the Protecting Horn's +1 / -1): the
  // +1 / -1 modifier cards to pick from, with the card that asks
  // (`detail.sourceCardId`) beside them wearing the pink "effect working"
  // aura (the owner, 2026-09-04).
  const valueAsk = view.pendingWindows.find(
    (window) =>
      window.isYours &&
      unanswered(window) &&
      window.type === 'ValueChoice' &&
      !!window.options?.length,
  )
  const valueAskCard = cardById(
    view,
    typeof valueAsk?.detail?.sourceCardId === 'string' ? valueAsk.detail.sourceCardId : undefined,
  )
  // A card is being chosen FROM the viewer's hand: the fan only opens on
  // hover, so the closed stack wears the gold ask until it is answered
  // (the owner, 2026-09-04: "add a glow to the deck").
  /**
   * This choice is answered INSIDE the discard browser — Call of the Fallen
   * and every other pick off the pile.
   *
   * The browser opens itself for one (the owner, 2026-09-08): the cards are
   * face up but the pile is shut, so a question about them was asked over a
   * board that did not show them. It also carries the clock and the question,
   * because every board choice is hidden from the pending-windows strip and
   * the centre banner stands down while the pile is up.
   */
  const discardPick =
    boardChoice?.pairs.some((pair) => pair.key.startsWith('discardCard:')) === true
      ? boardChoice
      : null
  // A pick off the pile opens the pile. Only on the way IN, so closing it
  // by hand during a pick does not fight the effect reopening it.
  const pickingFromPile = !!discardPick
  useEffect(() => {
    if (pickingFromPile) setDiscardOpen(true)
  }, [pickingFromPile])

  const handChoiceOpen =
    !!boardChoice && boardChoice.pairs.some((pair) => pair.key.startsWith('handCard:'))
  /**
   * What the fan shows. A reaction window narrows it to the cards that answer
   * that window — but a QUESTION put to this seat wins, and shows the cards
   * the question is about.
   *
   * Bloodwing is why: it asks the challenger to discard while the challenge
   * is on stage, and narrowing to the cards that answer the challenge hid
   * every card the discard was offering (the owner, 2026-09-08).
   */
  const handVisible = handChoiceOpen
    ? view.hand.map((card) => boardChoice!.window.options!.includes(card.id))
    : answersWith
      ? view.hand.map((card) => card.type === answersWith)
      : undefined
  // The optional question may be about a card in the HAND — Mellow Dee's
  // "play the hero you just drew?" names the drawn card — so that card
  // wears the gold ask (pressing it says yes: a FREE play, not PlayHero)
  // and the closed stack shows the ask as well.
  const askedInHand = view.hand.map((card) => !!askedCardId && card.id === askedCardId)
  const handAsked = handChoiceOpen || askedInHand.some(Boolean)
  // A card choice whose options are NOT on the board — Bullseye's look at the
  // deck's top three — is answered from a picker drawing the cards themselves
  // (the view's `optionCards`), gold like any pick.
  const cardPick = boardChoice
    ? null
    : (view.pendingWindows.find(
        (window) =>
          window.isYours &&
          unanswered(window) &&
          (window.type === 'CardChoice' || window.type === 'MonsterChoice') &&
          !!window.optionCards?.length,
      ) ?? null)
  // Off-board choices name the asking ability in the picker.
  const askingWindow = boardChoice?.window ?? cardPick
  const askingCard = cardById(
    view,
    typeof askingWindow?.detail?.sourceCardId === 'string' ? askingWindow.detail.sourceCardId : undefined,
  )
  // The ask lives on the board only when the viewer can PRESS the card it is
  // about — their own hand card or their own party hero. A question about
  // somebody else's card (Plundering Puma's "you may draw", asked of its
  // victim and naming the Puma in the thief's party) keeps its strip window
  // and its Confirm / Dismiss buttons; hiding it left the victim nothing.
  const mySlot = (Object.entries(slots) as [PlayerId, string | null][]).find(
    ([, id]) => id === view.playerId,
  )?.[0]
  // The card ASKING (the ability) and the card asked ABOUT, for the overlay.
  const askCard = cardById(
    view,
    typeof optionalAsk?.detail?.sourceCardId === 'string' ? optionalAsk.detail.sourceCardId : undefined,
  )
  const askSubject = cardById(view, askedCardId)
  // A choice of ACTION is about a card too: the Corrupted Sabretooth asks
  // "steal it instead of destroying it?" about a particular hero, and the
  // answer is meaningless without knowing which (the owner, 2026-09-08). The
  // server already names it — `cardId` on the window, from the choice's
  // `subjectKey` (choose-tasks.ts ChooseActionTask).
  const actionCard = cardById(
    view,
    typeof actionAsk?.detail?.sourceCardId === 'string'
      ? actionAsk.detail.sourceCardId
      : undefined,
  )
  const actionSubject = cardById(
    view,
    typeof actionAsk?.detail?.cardId === 'string' ? actionAsk.detail.cardId : undefined,
  )
  const askedKey = askedCardId ? targetKeyForId(view, askedCardId) : null
  const askOnBoard =
    !!askedKey &&
    (askedKey.startsWith('handCard:') || (!!mySlot && askedKey.startsWith(`hero:${mySlot}:`)))
  const forfeit = async (): Promise<boolean> => {
    if (!optionalAsk) return true
    const result = await send({
      type: 'SubmitChoice',
      payload: { windowId: optionalAsk.windowId, choice: 'dismiss' },
    })
    return handleResult(result)
  }

  // Answers this seat would almost always give, given for it. Through the
  // very paths a press takes: `run` for a submission, `forfeitWindow` for a
  // skip — so a lazy answer and a manual one are the same command.
  const lazyPassing = useLazyChoice(
    lazyPlan,
    (windowId, choice) => void run({ type: 'SubmitChoice', payload: { windowId, choice } }),
    () => void forfeitWindow(),
  )
  // A pass already on its way is not an action to offer: the button stands
  // down for exactly as long as the lazy skip is waiting.
  const canSkipNow = passableWindows.length > 0 && !lazyPassing

  // what the gems' tooltip says while a question is open — the same wording
  // the ChoicePrompt banner puts up, so the two can never disagree
  const asking = boardChoice?.window ?? optionalAsk
  const question = asking ? choiceInstruction(asking) : undefined

  const activate = (source: TargetKey) => {
    if (shiftHeld.current) setLazySuspended(true)
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
    if (optionalAsk && card.id === askedCardId) {
      // the card the question is about: pressing it is "yes" — the engine
      // plays it for free; PlayHero would forfeit the offer and pay a point
      void send({
        type: 'SubmitChoice',
        payload: { windowId: optionalAsk.windowId, choice: 'confirm' },
      }).then(handleResult)
      return
    }
    if (card.type === 'Hero') {
      void run({ type: 'PlayHero', payload: { cardId: card.id } })
    } else if (card.type === 'Magic') {
      void run({ type: 'PlayMagic', payload: { cardId: card.id } })
    } else if (card.type === 'Item') {
      // Whom an item may go on lives in playable.ts, because the same rule
      // decides whether the card glows at all — with no bare hero anywhere
      // the card is not playable and this handler is never reached.
      const targets = equipTargets(view, card).flatMap((bare) => {
        const slot = (Object.entries(slots) as [PlayerId, string | null][]).find(([, id]) => id === bare.playerId)?.[0]
        return slot ? [tkey.hero(slot, bare.index)] : []
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
        // A started challenge has two rolls: aim at one of the two roll
        // panels in the overlay; the panel's side names whose roll the
        // modifier lands on (the server refuses one that names no side).
        const sideOf: Record<ChallengeRole, string> = {
          challenged: liveChallenge.defenderId,
          challenger: liveChallenge.challengerId,
        }
        // Lazy Choice answers the WHOLE play: the number and the roll it
        // lands on are one decision, so it picks both and sends it. The
        // value is not a server window here — a two-valued card is asked
        // for in a local dialog (playModifier) — which is why watching for
        // a ValueChoice never answered a challenge (the owner, 2026-09-08).
        const swing =
          settings.lazyChoice && !lazySuspended && !shiftHeld.current
            ? lazyModifierValue(card.values ?? [])
            : null
        if (swing !== null) {
          const backed = backedRole(view, liveChallenge.defenderId, liveChallenge.challengerId)
          const other: ChallengeRole = backed === 'challenged' ? 'challenger' : 'challenged'
          playModifier(card, sideOf[swing > 0 ? backed : other], swing)
          return
        }
        begin({
          source,
          tone: 'reaction',
          sourceCardId: card.id,
          targets: (['challenged', 'challenger'] as const).map((role) =>
            tkey.challengeRoll(role),
          ),
          onPick: (target) => {
            const role = target.split(':')[1] as ChallengeRole
            playModifier(card, sideOf[role])
          },
        })
        return
      }
      // A roll has one target and the server names it: no aiming, the
      // press goes straight to the value.
      playModifier(card)
    } else if (card.type === 'Challenge') {
      // Likewise: the card contests whichever play is open to a challenge.
      void run({ type: 'Challenge', payload: { cardId: card.id } })
    }
  }

  useEffect(() => {
    if (active?.tone !== 'reaction' || !active.sourceCardId) return
    const index = view.hand.findIndex((card) => card.id === active.sourceCardId)
    if (index < 0 || !flags.hand[index]) { cancel(); return }
    activate(tkey.handCard(index))
    // Refresh target identities and callbacks together when the board changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  return (
    <div
      onMouseDownCapture={(event) => {
        shiftHeld.current = event.shiftKey
      }}
      className={`board-root relative h-screen w-screen overflow-hidden bg-zinc-950${
        active ? ` targeting${active.tone === 'reaction' ? ' reaction-targeting' : ''}` : ''
      }${active?.tone === 'choice' ? ' choice-targeting' : ''}${stageOpen ? ' challenge-open' : ''}${auraClasses(
        settings,
      )}`}
      onClick={(event) => {
        if (handHeldOpen && pressedFelt(event)) setHandHeldOpen(false)
        if (active) cancel()
      }}
    >
      <div
        className="board-felt dimmable absolute inset-0"
        style={{ backgroundImage: `url("${tableBackground}")`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      />
      {/* The screen's own two words: RED while an opponent's roll is aimed at
          you, GREEN while the turn is yours. Both are legible from under the
          modifier window's overlay, and both sit outside the stage — it is the
          SCREEN's edge, not the table's. Red wins when both apply. */}
      {myTurn && (
        <div
          aria-hidden
          className="turn-vignette turn-side-all pointer-events-none absolute inset-0 z-[300]"
        />
      )}
      {/* the red rim rides OVER the green one: being the target of a roll is
          the more urgent of the two, and they are the same geometry so the
          green still shows through at the edges it is not on */}
      {targeted && (
        <div
          aria-hidden
          className="target-vignette pointer-events-none absolute inset-0 z-[301]"
        />
      )}
      <div
        className="board-stage absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 [container-type:size]"
        style={{ width: 'min(100vw, calc(100vh * 16 / 9))', height: 'min(100vh, calc(100vw * 9 / 16))' }}
      >
        <div
          className="absolute z-20 -translate-x-1/2 -translate-y-1/2 has-[.is-zoomed]:z-[120]"
          style={{ left: `calc(50% + ${CENTER_DX}cqh)`, top: `calc(50% + ${CENTER_DY}cqh)`, height: `${CENTER_H}cqh`, width: `${CENTER_H * ASPECT.center}cqh` }}
        >
          <AssetImage src={FRAMES.center} alt="" aria-hidden draggable={false} className="board-felt dimmable absolute inset-0 h-full w-full object-fill" />
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
          // Somebody else's turn is said by THEIR corner of the table; the
          // viewer's own is the screen rim, so the two never both fire.
          const theirTurn =
            !isMine && view.phase === 'Turns' && view.currentPlayerId === playerId
          return (
            <React.Fragment key={slot}>
              <Widget def={layout.heroes} anchor={layout.anchor} turn={theirTurn}>
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
              <Widget def={layout.leader} anchor={layout.anchor} turn={theirTurn}>
                {!isMine && <SeatName name={nameOf(view, playerId)} anchor={layout.anchor} />}
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
                  room={trophyRoom(layout, layout.anchor === 'right' ? 'left' : 'right')}
                />
              </Widget>
              <Widget
                def={layout.cardback}
                anchor={layout.anchor}
                turn={theirTurn}
                zClass="z-40"
                // during a challenge the LOCAL hand is part of the bright
                // layer — raised above the overlay's click shield (z-140) and
                // above the HUD's opener (z-160): a hand that is opened sits
                // over everything (the owner, 2026-09-06). The same condition as
                // the z: an opponent's face-down stack is drawn with the SAME
                // art as the main deck, so exempting it too read as the decks
                // floating over the dim (the owner, 2026-09-07).
                // A discard chosen from the hand is answered in here too —
                // Bloodwing asks the challenger for one while the challenge
                // is on stage — so the fan rises for that as well as for a
                // reaction it can answer (the owner, 2026-09-08).
                zIndex={stageOpen && isMine && (canAnswer || handChoiceOpen) ? 170 : undefined}
                dimExempt={stageOpen && isMine}
              >
                {isMine ? (
                  <PlayerHand
                    cards={view.hand.map((card) => artFor(card).url)}
                    ids={view.hand.map((card) => card.id)}
                    anchorCenterCqw={82}
                    playable={flags.hand}
                    free={view.hand.map(isFreeAction)}
                    asked={askedInHand}
                    onActivateCard={(index) => activate(tkey.handCard(index))}
                    visible={handVisible}
                    // A pick FROM the hand — a discard, a card to give
                    // away — opens the fan on its own: the answer is in
                    // there and the closed stack cannot be pressed
                    // (the owner, 2026-09-08). Same door a reaction opens.
                    forceOpen={(!!answersWith && canAnswer) || handChoiceOpen}
                    sticky={settings.stickyHand}
                    stuckOpen={handHeldOpen}
                    onStickyOpen={() => setHandHeldOpen(true)}
                  >
                    <HandCount
                      count={view.hand.length}
                      playable={hasPlayableHandCard}
                      asked={handAsked}
                      targetKey={tkey.handStack(slot)}
                    />
                  </PlayerHand>
                ) : (
                  <HandCount count={player.handCount} targetKey={tkey.handStack(slot)} />
                )}
              </Widget>
            </React.Fragment>
          )
        })}

        {/* the volume now lives behind the gear, not on the felt
            (the owner, 2026-09-07) */}
        <HudWidget def={HUD_WIDGETS.settings} aspect={1} aboveChallenge>
          <SettingsMenu config={info?.config} log={log} />
        </HudWidget>
        {/* One painted slot for the reaction windows: the challenge plaque
            while a challenge runs, the modifier plaque while a roll does, and
            greyed on its own when neither is (the owner, 2026-09-07) — it used
            to unmount, so the slot blinked in and out of the rim.
            `dim-exempt` on the wrapper: ImageButton's art is `dimmable`, and
            without it the painted plaque would go dark under targeting the way
            a card does. */}
        <HudWidget def={HUD_WIDGETS.challengeButton} aspect={HUD_ASPECT.answer} aboveChallenge={stageOpen} yields>
          <div className="dim-exempt h-full w-full">
            <ImageButton
              src={liveChallenge ? HUD.challengeWindow : HUD.modifierWindow}
              label={liveChallenge ? 'Challenge window' : 'Modifier window'}
              enabled={!!liveChallenge || !!liveRoll}
              onClick={() => {
                if (liveChallenge) setOverlayHidden((hidden) => !hidden)
                else {
                  setManuallyOpenedRollId(liveRoll?.windowId ?? null)
                  setModifierHidden(modifierOpen)
                }
              }}
            />
          </div>
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
        <HudWidget def={HUD_WIDGETS.turnTimer} aspect={1}>
          <TurnTimer clock={view.turnClock} />
        </HudWidget>
        <HudWidget
          def={HUD_WIDGETS.actionPoints}
          aspect={HUD_ASPECT.actionFrame}
          title={
            liveRoll
              ? rollLabel(liveRoll, view)
              : boardChoice
                ? `choose: ${typeof question === 'string' ? question : boardChoice.window.type}`
                : `${
                    view.currentPlayerId === view.playerId
                      ? 'your turn'
                      : `${nameOf(view, view.currentPlayerId)}'s turn`
                  } · ${current?.actionPoints ?? mine?.actionPoints ?? 0} AP${view.busy ? ' · busy' : ''}`
          }
        >
          {/* the CURRENT player's points, not the viewer's: the bar says what
              the turn has left to spend (the owner, 2026-09-07) */}
          <ActionPoints current={current?.actionPoints ?? mine?.actionPoints ?? 0} />
        </HudWidget>
        <HudWidget def={HUD_WIDGETS.endTurn} aspect={HUD_ASPECT.button} aboveChallenge>
          {view.phase === 'Concluded' ? (
            // once the game is over the End Turn slot is the Exit button
            // (same art until the owner's Exit art lands)
            <ImageButton src={HUD.endTurn} label="Exit" enabled onClick={leaveGame} />
          ) : canSkipNow && !modifierOpen ? (
            // Only while there IS something to give up (the owner,
            // 2026-09-08): a Skip with nothing behind it reads as an action
            // the table is waiting on. The modifier window carries its own
            // Skip beside the total, so while that is up this slot stays out
            // of the way.
            <ImageButton
              src={HUD.skipReaction}
              label="Skip reaction"
              enabled
              glow
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
        <HudWidget def={HUD_WIDGETS.redraw} aspect={HUD_ASPECT.button} yields>
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
            ...(valueAsk ? [valueAsk.windowId] : []),
            ...(cardPick ? [cardPick.windowId] : []),
            // a yes/no is answered either on the board (the card glows) or in
            // the ConfirmAsk overlay below — never as a strip card as well
            ...(optionalAsk ? [optionalAsk.windowId] : []),
            ...(actionAsk ? [actionAsk.windowId] : []),
          ]}
          onSubmit={(windowId, choice) =>
            void run({ type: 'SubmitChoice', payload: { windowId, choice } })
          }
        />
        {/* what the open choice wants of you, in large type over whatever it
            is answered on — and never in the way of answering it */}
        {/* the pile carries the question in its own header while it is up:
            its backdrop is translucent, so a banner behind it reads as a
            ghost plate over the cards (the owner, 2026-09-08) */}
        {!discardOpen && <ChoicePrompt view={view} />}
        <ReactionPrompt view={view} />
        <DiceRoll roll={dice} outcome={diceOutcome} />
        <ChallengeWindow
          hidden={overlayHidden || myQuestionOpen}
          onHide={() => setOverlayHidden(true)}
        />
        <ModifierWindow
          roll={modifierRoll}
          hidden={modifierHidden || challengeOpen || myQuestionOpen}
          onHide={() => setModifierHidden(true)}
          canSkip={canSkipNow}
          onSkip={canSkipNow ? () => void forfeitWindow() : undefined}
        />

        <RevealedCards view={view} />

        {discardOpen && (
          <DiscardPileModal
            cards={discardCards}
            deadline={discardPick?.window.deadline}
            question={discardPick ? choiceInstruction(discardPick.window) : undefined}
            onClose={() => setDiscardOpen(false)}
          />
        )}

        {actionAsk && (
          <div className="dim-exempt absolute inset-0 z-[210] flex items-center justify-center bg-black/60">
            <div className="rounded-[.6cqw] border border-amber-400/70 bg-zinc-950 p-[1cqw] text-center text-amber-100 shadow-2xl">
              <div className="mb-[.7cqh] font-heading text-[.9cqw] text-amber-300">
                {choiceInstruction(actionAsk)}
              </div>
              {(actionCard || actionSubject) && (
                <div className="mb-[.9cqh] flex items-center justify-center gap-[1.2cqw]">
                  {/* the card ASKING wears the pink of a rule in force… */}
                  {actionCard && (
                    <AssetImage
                      src={artFor(actionCard).url}
                      alt={actionCard.name}
                      draggable={false}
                      className="passive-aura h-[26cqh] rounded-[.35cqw] object-contain"
                    />
                  )}
                  {/* …and the card it is ABOUT the gold of the thing at stake */}
                  {actionSubject && actionSubject.id !== actionCard?.id && (
                    <AssetImage
                      src={artFor(actionSubject).url}
                      alt={actionSubject.name}
                      draggable={false}
                      className="ask-aura h-[26cqh] rounded-[.35cqw] object-contain"
                    />
                  )}
                </div>
              )}
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

        {/* A yes/no about a card the viewer cannot press — the Crowned
            Serpent's "you may draw", asked of its owner about a monster in
            their own party — takes the stage instead of the strip card it
            used to get, which sat UNDER the modifier window (the owner,
            2026-09-07): the card that asks beside the two painted answers. */}
        {optionalAsk && !askOnBoard && (
          <div className="dim-exempt absolute inset-0 z-[210] flex items-center justify-center bg-black/60">
            <div className="rounded-[.6cqw] border border-amber-400/70 bg-zinc-950 p-[1cqw] text-center text-amber-100 shadow-2xl">
              <div className="mb-[.7cqh] font-heading text-[.9cqw] text-amber-300">
                {askCard?.name ?? 'Your response'}
              </div>
              <div className="flex items-center justify-center gap-[1.2cqw]">
                {askCard && (
                  <AssetImage
                    src={artFor(askCard).url}
                    alt={askCard.name}
                    draggable={false}
                    className="passive-aura h-[30cqh] rounded-[.35cqw] object-contain"
                  />
                )}
                {/* the subject, when the question is about a DIFFERENT card
                    than the one asking (Quick Draw's drawn Item) */}
                {askSubject && askSubject.id !== askCard?.id && (
                  <AssetImage
                    src={artFor(askSubject).url}
                    alt={askSubject.name}
                    draggable={false}
                    className="ask-aura h-[30cqh] rounded-[.35cqw] object-contain"
                  />
                )}
                <div className="flex flex-col gap-[1.2cqh]">
                  <div style={{ height: `${ANSWER_H}cqh`, width: `${ANSWER_H * HUD_ASPECT.answer}cqh` }}>
                    <ImageButton
                      src={HUD.draw}
                      label={question ? `Yes — ${question}` : 'Yes'}
                      enabled
                      glow
                      onClick={() =>
                        void send({
                          type: 'SubmitChoice',
                          payload: { windowId: optionalAsk.windowId, choice: 'confirm' },
                        }).then(handleResult)
                      }
                    />
                  </div>
                  <div style={{ height: `${ANSWER_H}cqh`, width: `${ANSWER_H * HUD_ASPECT.answer}cqh` }}>
                    <ImageButton
                      src={HUD.forfeit}
                      label="No"
                      enabled
                      onClick={() => void forfeit()}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-[.8cqh]">
                <Countdown deadline={optionalAsk.deadline} />
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
                          value,
                          ...(selection.targetPlayerId ? { targetPlayerId: selection.targetPlayerId } : {}),
                        },
                      })
                    }}
                  >
                    <AssetImage
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

        {cardPick && (
          <div className="absolute inset-0 z-[180] flex items-center justify-center bg-black/60">
            <div className="rounded-[.6cqw] border border-amber-400/70 bg-zinc-950 p-[1cqw] text-center text-amber-100 shadow-2xl">
              {/* the banner above says WHAT to pick; this names who is asking */}
              <div className="mb-[.7cqh] font-heading text-[.9cqw] text-amber-300">
                {askingCard?.name ?? 'Choose a card'}
              </div>
              <div className="flex items-center justify-center gap-[1cqw]">
                {askingCard && (
                  <AssetImage
                    src={artFor(askingCard).url}
                    alt={askingCard.name}
                    draggable={false}
                    className="passive-aura mr-[1cqw] h-[30cqh] rounded-[.35cqw] object-contain"
                  />
                )}
                {cardPick.optionCards!.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    aria-label={`Choose ${card.name}`}
                    className="group rounded-[.45cqw] border border-amber-400/60 bg-amber-950/70 p-[.35cqw] transition hover:-translate-y-[.35cqh] hover:border-amber-200 hover:brightness-125"
                    onClick={() =>
                      void run({
                        type: 'SubmitChoice',
                        payload: { windowId: cardPick.windowId, choice: card.id },
                      })
                    }
                  >
                    <AssetImage
                      src={artFor(card).url}
                      alt={card.name}
                      draggable={false}
                      className="ask-aura h-[30cqh] rounded-[.35cqw] object-contain"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {valueAsk && (
          <div className="absolute inset-0 z-[180] flex items-center justify-center bg-black/60">
            <div className="rounded-[.6cqw] border border-amber-400/70 bg-zinc-950 p-[1cqw] text-center text-amber-100 shadow-2xl">
              <div className="mb-[.7cqh] font-heading text-[.9cqw] text-amber-300">
                {valueAskCard ? `${valueAskCard.name}: choose value` : 'Choose value'}
              </div>
              <div className="flex items-center justify-center gap-[1cqw]">
                {valueAskCard && (
                  <AssetImage
                    src={artFor(valueAskCard).url}
                    alt={valueAskCard.name}
                    draggable={false}
                    className="passive-aura mr-[1cqw] h-[25cqh] rounded-[.35cqw] object-contain"
                  />
                )}
                {(valueAsk.options as number[])
                  .slice()
                  .sort((a, b) => a - b)
                  .map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={`Choose ${value > 0 ? '+' : ''}${value}`}
                      className="group rounded-[.45cqw] border border-amber-400/60 bg-amber-950/70 p-[.35cqw] transition hover:-translate-y-[.35cqh] hover:border-amber-200 hover:brightness-125"
                      onClick={() =>
                        void run({
                          type: 'SubmitChoice',
                          payload: { windowId: valueAsk.windowId, choice: value },
                        })
                      }
                    >
                      <ValueArt value={value} />
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
