import * as dice from '../../utils/roll-utils'
import {
  CardBase,
  CardType,
  GameConfig,
  GameEventType,
  IGameEvent,
  MonsterCardData,
  PendingWindowView,
  PlayerView,
  ReactionWindowType,
  WinConditionType,
} from 'shared'
import { defaultGameConfig } from '../config/game-config'
import { baseGameCards } from '../../data/base-game-cards'
import { createGame, startGame, Game } from './create-game'
import { playerView } from '../views/player-view'
import { IAction, IReaction } from '../interfaces'
import { CONFIRM } from '../reactions/task-choice-window'
import { DrawCardAction } from '../actions/draw-card-action'
import { PlayHeroAction } from '../actions/play-hero-action'
import { PlayItemAction } from '../actions/play-item-action'
import { PlayMagicAction } from '../actions/play-magic-action'
import { RollOnHeroAction } from '../actions/roll-on-hero-action'
import { RollOnLeaderAction } from '../actions/roll-on-leader-action'
import { AttackMonsterAction } from '../actions/attack-monster-action'
import { EndTurnAction } from '../actions/end-turn-action'
import { RedrawHandAction } from '../actions/redraw-hand-action'
import { PlayChallengeReaction } from '../reactions/play-challenge-reaction'
import { PlayModifierReaction } from '../reactions/play-modifier-reaction'

// ---------------------------------------------------------------------------
// The harness behind play-through.spec.ts and full-game.spec.ts.
//
// A real dealt table, driven the way the API will drive it: wiring order,
// event ordering across the two pipelines, frames that never settle and turns
// that never end are all invisible to a unit test.
//
// It touches the engine only where a PLAYER does — `turnManager.enqueue`,
// `reactionManager.submitReaction`, `reactionManager.submitChoice`, and
// `playerView` to read. `gameState` is never touched, not even to check a
// result, so a case that cannot be written here is one the API cannot reach
// either. The raw event log is used for verification; a client gets it too.
//
// Real windows on a real clock, shrunk by config rather than faked. Advancing
// fake timers means guessing how many windows a move opens, and guessing low
// reads as a passing test.
// ---------------------------------------------------------------------------

export const SEATS = ['alice', 'bob', 'carol']
// Real windows on a real clock. 150ms rather than the smallest number that
// works: the shortest window here is a nested ValueChoice at 0.6 of it (90ms),
// and a test has to catch that window OPEN — a loaded machine that stalls the
// process past it turns a pass into a failure to find the window at all.
export const COUNTDOWN_MS = 150
export const POLL_MS = 5

export const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

let actionCounter = 0
export const actionId = () => `a${++actionCounter}`

// ---------------------------------------------------------------------------
// Dealing
// ---------------------------------------------------------------------------

export const byId = new Map(baseGameCards.map((card) => [card.id, card]))

export function printed(cardId: string): CardBase {
  const card = byId.get(cardId)
  if (!card) throw new Error(`no printed card ${cardId}`)
  return card
}

export const ALL_MONSTERS = baseGameCards.filter((c) => c.type === CardType.Monster)

/**
 * Leaders with no standing bonus, so a dealt table's dice mean what they say.
 * The Divine Arrow, the Fist of Reason and the Charismatic Song each install a
 * `RollBonus` on `GameStarted` (§7) and would move every roll below by one.
 */
export const QUIET_LEADERS = ['leader-117', 'leader-120', 'leader-121'].map(printed)

/**
 * Heroes with nothing printed on them, padding a stacked deck out past the
 * deal — a deck that runs dry leaves a player unable to end their turn (§10).
 */
export const FILLER = [
  'hero-001',
  'hero-002',
  'hero-003',
  'hero-004',
  'hero-005',
  'hero-006',
  'hero-008',
  'hero-009',
  'hero-010',
  'hero-011',
  'hero-012',
  'hero-013',
  'hero-014',
  'hero-015',
  'hero-016',
  'hero-017',
  'hero-018',
  'hero-019',
]

export function padded(deck: string[], need: number): string[] {
  const out = [...deck]
  for (const id of FILLER) {
    if (out.length >= need) break
    if (!out.includes(id)) out.push(id)
  }
  if (out.length < need) throw new Error('stacked: ran out of filler heroes')
  return out
}

export type Deal = {
  seats?: string[]
  /**
   * The main deck, top first. Seat 0 is dealt the first `startingHandSize`,
   * seat 1 the next, and so on; whatever is left stays in the deck.
   */
  deck: string[]
  /** The monster deck, top first. The row is the first three. */
  monsters?: string[]
  handSize?: number
  /** How many slain monsters win. Out of reach unless a case asks for it. */
  winAt?: number
  /** How many distinct classes win, the leader's included. */
  classesWin?: number
  /** Cards left in the deck after the deal. Padded with filler heroes. */
  slack?: number
  /** A turn clock, ms. None by default: a stacked case ends its turns itself. */
  turnTimeMs?: number
  /** `GameConfig.seamlessReactions`. Off by default, like the printed game. */
  seamless?: boolean
}

export type Table = { game: Game; events: IGameEvent[] }

export function config(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    ...defaultGameConfig,
    ...overrides,
    timeControl: {
      ...defaultGameConfig.timeControl,
      ...overrides.timeControl,
      reactionCountdownMs: COUNTDOWN_MS,
    },
  }
}

/** An ordinary game off the full 136 cards, shuffled for real. */
export function table(
  seats: string[] = SEATS,
  overrides: Partial<GameConfig> = {},
): Table {
  return started(createGame(seats, { config: config(overrides) }))
}

/**
 * A table whose deal is NOT a shuffle. `Math.random` is pinned across
 * `createGame` only, which makes Fisher-Yates the identity: seat order,
 * leaders and the main deck all come out as written.
 *
 * The win conditions are pushed out of reach on purpose, so a stacked case
 * ends when its script says and not when the board happens to qualify.
 */
export function stacked(spec: Deal): Table {
  const handSize = spec.handSize ?? 2
  const seats = spec.seats ?? ['alice', 'bob']
  const deck = padded(spec.deck, seats.length * handSize + (spec.slack ?? 8))
  assertShufflePinnable(deck.length)

  const monsters = spec.monsters?.map(printed) ?? []
  const cards = [
    ...QUIET_LEADERS,
    ...monsters,
    ...ALL_MONSTERS.filter(
      (m) => !monsters.some((chosen) => chosen.id === m.id),
    ),
    ...deck.map(printed),
  ]

  const pinned = jest.spyOn(Math, 'random').mockReturnValue(SHUFFLE_PIN)
  try {
    return started(
      createGame(seats, {
        config: config({
          startingHandSize: handSize,
          winConditions: [
            { type: WinConditionType.SlayMonsters, value: spec.winAt ?? 99 },
            ...(spec.classesWin === undefined
              ? []
              : [{ type: WinConditionType.PartyClasses, value: spec.classesWin }]),
          ],
          timeControl: {
            ...defaultGameConfig.timeControl,
            turnTimeMs: spec.turnTimeMs,
          },
          seamlessReactions: spec.seamless ?? false,
        }),
        cards,
      }),
    )
  } finally {
    pinned.mockRestore()
  }
}

/**
 * `Math.floor(pin * (i + 1))` has to come out as `i` for every swap, or the
 * deal stops being the list it was written as.
 */
export const SHUFFLE_PIN = 0.999

export function assertShufflePinnable(size: number): void {
  if (size > 1 / (1 - SHUFFLE_PIN)) {
    throw new Error(
      `stacked: ${size} cards is too many for the pinned shuffle to be the ` +
        'identity — split the case or raise SHUFFLE_PIN.',
    )
  }
}

export function started(game: Game): Table {
  const events: IGameEvent[] = []
  game.emitter.addListener({ onEvent: (e) => events.push(e) })
  startGame(game)
  return { game, events }
}

// ---------------------------------------------------------------------------
// What a player sees
// ---------------------------------------------------------------------------

export const see = (t: Table, playerId: string): PlayerView =>
  playerView(t.game, playerId)

/** The public half of the board, read from a seat. Every seat sees the same. */
export const board = (t: Table): PlayerView => see(t, t.game.playerOrder[0])

export const active = (t: Table): string => board(t).currentPlayerId!

export const seatOf = (v: PlayerView, playerId: string) =>
  v.seats.find((s) => s.playerId === playerId)!

export const partyOf = (v: PlayerView, playerId: string) =>
  v.parties.find((p) => p.playerId === playerId)!

export const heldOfType = (v: PlayerView, type: CardType) =>
  v.hand.find((card) => card.type === type)?.id

export const inDiscard = (v: PlayerView, cardId: string) =>
  v.discardPile.some((card) => card.id === cardId)

export const ofType = (t: Table, type: GameEventType) =>
  t.events.filter((e) => e.getType() === type)

export const payloads = (t: Table, type: GameEventType) =>
  ofType(t, type).map((e) => e.getPayload() as Record<string, unknown>)

// ---------------------------------------------------------------------------
// What a player does
// ---------------------------------------------------------------------------

export const enqueue = (t: Table, action: IAction) =>
  t.game.turnManager.enqueue(action)
export const react = (t: Table, reaction: IReaction) =>
  t.game.reactionManager.submitReaction(reaction)
export const answer = (t: Table, window: PendingWindowView, choice: unknown) =>
  t.game.reactionManager.submitChoice(
    window.windowId,
    window.respondentId,
    choice,
  )

export const draw = (t: Table, playerId: string) =>
  enqueue(t, new DrawCardAction(actionId(), playerId, t.game.emitter))

export const playHero = (t: Table, playerId: string, cardId: string) =>
  enqueue(
    t,
    new PlayHeroAction(
      actionId(),
      playerId,
      cardId,
      t.game.reactionManager,
      t.game.emitter,
    ),
  )

export const playMagic = (t: Table, playerId: string, cardId: string) =>
  enqueue(
    t,
    new PlayMagicAction(
      actionId(),
      playerId,
      cardId,
      t.game.reactionManager,
      t.game.emitter,
    ),
  )

export const playItem = (t: Table, playerId: string, cardId: string, heroId: string) =>
  enqueue(
    t,
    new PlayItemAction(
      actionId(),
      playerId,
      cardId,
      heroId,
      t.game.reactionManager,
      t.game.emitter,
    ),
  )

export const rollOnHero = (t: Table, playerId: string, cardId: string) =>
  enqueue(
    t,
    new RollOnHeroAction(
      actionId(),
      playerId,
      cardId,
      t.game.emitter,
      t.game.reactionManager,
    ),
  )

export const rollOnLeader = (t: Table, playerId: string, cardId: string) =>
  enqueue(
    t,
    new RollOnLeaderAction(actionId(), playerId, cardId, t.game.emitter),
  )

export const attack = (t: Table, playerId: string, monsterId: string) =>
  enqueue(
    t,
    new AttackMonsterAction(
      actionId(),
      playerId,
      monsterId,
      t.game.reactionManager,
      t.game.emitter,
    ),
  )

export const pass = (t: Table, playerId: string) =>
  enqueue(t, new EndTurnAction(actionId(), playerId))

export const redraw = (t: Table, playerId: string) =>
  enqueue(t, new RedrawHandAction(actionId(), playerId, t.game.emitter))

// ---------------------------------------------------------------------------
// Waiting
// ---------------------------------------------------------------------------

export async function until(
  check: () => boolean,
  what: string,
  deadlineMs = 4000,
): Promise<void> {
  const stop = Date.now() + deadlineMs
  while (Date.now() < stop) {
    if (check()) return
    await sleep(POLL_MS)
  }
  throw new Error(`timed out waiting for ${what}`)
}

/** Waits for the board to report itself idle, however many windows that takes. */
export const settle = (t: Table, deadlineMs = 4000) =>
  until(() => !board(t).busy, 'the board to go idle', deadlineMs)

/** Waits for a window addressed to `playerId`, and hands it back to answer. */
export async function windowFor(
  t: Table,
  playerId: string,
  type: ReactionWindowType,
  deadlineMs = 2000,
): Promise<PendingWindowView> {
  let found: PendingWindowView | undefined
  await until(
    () => {
      found = see(t, playerId).pendingWindows.find(
        (w) => w.isYours && w.type === type,
      )
      return !!found
    },
    `a ${type} window for ${playerId}`,
    deadlineMs,
  )
  return found!
}

/** Passes, and waits for the turn to roll over. */
export async function endTurn(t: Table): Promise<void> {
  const playerId = active(t)
  pass(t, playerId)
  await until(() => active(t) !== playerId, `the turn of ${playerId} to end`)
}

/** Burns whole turns until `playerId`'s NEXT one, with a fresh budget. */
export async function nextTurnOf(t: Table, playerId: string): Promise<void> {
  await endTurn(t)
  for (let guard = 0; guard <= SEATS.length + 1; guard++) {
    if (active(t) === playerId) return
    await endTurn(t)
  }
  throw new Error(`nextTurnOf: the turn never came round to ${playerId}`)
}

// ---------------------------------------------------------------------------
// Dice
//
//   a hero / attack roll is  Math.ceil(random * 11) + 1   → 2..12
//   a challenge roll is      Math.floor(random * 11) + 1  → 1..11
// ---------------------------------------------------------------------------

/** Every roll after this comes up 12 — above any printed requirement. */
export const HIGHEST = 0.999
/** Every roll after this comes up at the bottom of its range. */
export const LOWEST = 0.0001
/** A hero / attack roll of 8. */
export const MIDDLING = 0.6

export const fixDice = (value: number) => {
  jest.spyOn(dice, 'roll2Dice').mockReturnValue(2 * (Math.floor(value * 6) + 1))
  return jest.spyOn(Math, 'random').mockReturnValue(value)
}

/** A fixed sequence, then `rest` for everything after it. */
export function scriptDice(sequence: number[], rest: number): void {
  const queue = [...sequence]
  jest.spyOn(dice, 'roll2Dice').mockImplementation(() => 2 * (Math.floor((queue.shift() ?? rest) * 6) + 1))
}
