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
import { PlayChallengeReaction } from '../reactions/play-challenge-reaction'
import { PlayModifierReaction } from '../reactions/play-modifier-reaction'

// ---------------------------------------------------------------------------
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

const SEATS = ['alice', 'bob', 'carol']
// Real windows on a real clock. 150ms rather than the smallest number that
// works: the shortest window here is a nested ValueChoice at 0.6 of it (90ms),
// and a test has to catch that window OPEN — a loaded machine that stalls the
// process past it turns a pass into a failure to find the window at all.
const COUNTDOWN_MS = 150
const POLL_MS = 5

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

let actionCounter = 0
const actionId = () => `a${++actionCounter}`

// ---------------------------------------------------------------------------
// Dealing
// ---------------------------------------------------------------------------

const byId = new Map(baseGameCards.map((card) => [card.id, card]))

function printed(cardId: string): CardBase {
  const card = byId.get(cardId)
  if (!card) throw new Error(`no printed card ${cardId}`)
  return card
}

const ALL_MONSTERS = baseGameCards.filter((c) => c.type === CardType.Monster)

/**
 * Leaders with no standing bonus, so a dealt table's dice mean what they say.
 * The Divine Arrow, the Fist of Reason and the Charismatic Song each install a
 * `RollBonus` on `GameStarted` (§7) and would move every roll below by one.
 */
const QUIET_LEADERS = ['leader-117', 'leader-120', 'leader-121'].map(printed)

/**
 * Heroes with nothing printed on them, padding a stacked deck out past the
 * deal — a deck that runs dry leaves a player unable to end their turn (§10).
 */
const FILLER = [
  'hero-001', 'hero-002', 'hero-003', 'hero-004', 'hero-005', 'hero-006',
  'hero-008', 'hero-009', 'hero-010', 'hero-011', 'hero-012', 'hero-013',
  'hero-014', 'hero-015', 'hero-016', 'hero-017', 'hero-018', 'hero-019',
]

function padded(deck: string[], need: number): string[] {
  const out = [...deck]
  for (const id of FILLER) {
    if (out.length >= need) break
    if (!out.includes(id)) out.push(id)
  }
  if (out.length < need) throw new Error('stacked: ran out of filler heroes')
  return out
}

type Deal = {
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
  /** Cards left in the deck after the deal. Padded with filler heroes. */
  slack?: number
}

type Table = { game: Game; events: IGameEvent[] }

function config(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    ...defaultGameConfig,
    ...overrides,
    timeControl: {
      ...defaultGameConfig.timeControl,
      reactionCountdownMs: COUNTDOWN_MS,
    },
  }
}

/** An ordinary game off the full 136 cards, shuffled for real. */
function table(seats: string[] = SEATS, overrides: Partial<GameConfig> = {}): Table {
  return started(createGame(seats, { config: config(overrides) }))
}

/**
 * A table whose deal is NOT a shuffle. `Math.random` is pinned across
 * `createGame` only, which makes Fisher-Yates the identity: seat order,
 * leaders and the main deck all come out as written.
 *
 * The win conditions are pushed out of reach on purpose — `AllClassesInParty`
 * asks the POOL which classes exist, so a stacked deck of two Fighters makes
 * "every class" mean "one Fighter" and the first hero played wins.
 */
function stacked(spec: Deal): Table {
  const handSize = spec.handSize ?? 2
  const seats = spec.seats ?? ['alice', 'bob']
  const deck = padded(spec.deck, seats.length * handSize + (spec.slack ?? 8))
  assertShufflePinnable(deck.length)

  const monsters = spec.monsters?.map(printed) ?? []
  const cards = [
    ...QUIET_LEADERS,
    ...monsters,
    ...ALL_MONSTERS.filter((m) => !monsters.some((chosen) => chosen.id === m.id)),
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
          ],
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
const SHUFFLE_PIN = 0.999

function assertShufflePinnable(size: number): void {
  if (size > 1 / (1 - SHUFFLE_PIN)) {
    throw new Error(
      `stacked: ${size} cards is too many for the pinned shuffle to be the ` +
        'identity — split the case or raise SHUFFLE_PIN.',
    )
  }
}

function started(game: Game): Table {
  const events: IGameEvent[] = []
  game.emitter.addListener({ onEvent: (e) => events.push(e) })
  startGame(game)
  return { game, events }
}

// ---------------------------------------------------------------------------
// What a player sees
// ---------------------------------------------------------------------------

const see = (t: Table, playerId: string): PlayerView =>
  playerView(t.game, playerId)

/** The public half of the board, read from a seat. Every seat sees the same. */
const board = (t: Table): PlayerView => see(t, t.game.playerOrder[0])

const active = (t: Table): string => board(t).currentPlayerId!

const seatOf = (v: PlayerView, playerId: string) =>
  v.seats.find((s) => s.playerId === playerId)!

const partyOf = (v: PlayerView, playerId: string) =>
  v.parties.find((p) => p.playerId === playerId)!

const heldOfType = (v: PlayerView, type: CardType) =>
  v.hand.find((card) => card.type === type)?.id

const inDiscard = (v: PlayerView, cardId: string) =>
  v.discardPile.some((card) => card.id === cardId)

const ofType = (t: Table, type: GameEventType) =>
  t.events.filter((e) => e.getType() === type)

const payloads = (t: Table, type: GameEventType) =>
  ofType(t, type).map((e) => e.getPayload() as Record<string, unknown>)

// ---------------------------------------------------------------------------
// What a player does
// ---------------------------------------------------------------------------

const enqueue = (t: Table, action: IAction) => t.game.turnManager.enqueue(action)
const react = (t: Table, reaction: IReaction) =>
  t.game.reactionManager.submitReaction(reaction)
const answer = (t: Table, window: PendingWindowView, choice: unknown) =>
  t.game.reactionManager.submitChoice(window.windowId, window.respondentId, choice)

const draw = (t: Table, playerId: string) =>
  enqueue(t, new DrawCardAction(actionId(), playerId, t.game.emitter))

const playHero = (t: Table, playerId: string, cardId: string) =>
  enqueue(
    t,
    new PlayHeroAction(actionId(), playerId, cardId, t.game.reactionManager, t.game.emitter),
  )

const playMagic = (t: Table, playerId: string, cardId: string) =>
  enqueue(
    t,
    new PlayMagicAction(actionId(), playerId, cardId, t.game.reactionManager, t.game.emitter),
  )

const playItem = (t: Table, playerId: string, cardId: string, heroId: string) =>
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

const rollOnHero = (t: Table, playerId: string, cardId: string) =>
  enqueue(
    t,
    new RollOnHeroAction(actionId(), playerId, cardId, t.game.emitter, t.game.reactionManager),
  )

const rollOnLeader = (t: Table, playerId: string, cardId: string) =>
  enqueue(t, new RollOnLeaderAction(actionId(), playerId, cardId, t.game.emitter))

const attack = (t: Table, playerId: string, monsterId: string) =>
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

// ---------------------------------------------------------------------------
// Waiting
// ---------------------------------------------------------------------------

async function until(
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
const settle = (t: Table, deadlineMs = 4000) =>
  until(() => !board(t).busy, 'the board to go idle', deadlineMs)

/** Waits for a window addressed to `playerId`, and hands it back to answer. */
async function windowFor(
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

/**
 * Spends the active player's budget until the turn rolls over.
 *
 * A draw is the cheap way to burn a point, but a hand of ten refuses one and
 * so does an empty deck — and there is no PASS action (§10), so this needs a
 * second and a third thing to try or a long run deadlocks on the hand limit.
 */
async function endTurn(t: Table): Promise<void> {
  const playerId = active(t)

  for (let guard = 0; guard < 20 && active(t) === playerId; guard++) {
    const before = seatOf(see(t, playerId), playerId).actionPoints

    draw(t, playerId)
    await settle(t)
    if (active(t) !== playerId) return
    if (seatOf(see(t, playerId), playerId).actionPoints < before) continue

    // The draw was refused. Whatever else is legal, then.
    const view = see(t, playerId)
    const heroId = heldOfType(view, CardType.Hero)
    if (heroId) {
      playHero(t, playerId, heroId)
      await settle(t)
      continue
    }
    const party = partyOf(view, playerId)
    if (party.canRollOnLeader) {
      rollOnLeader(t, playerId, party.leader.id)
      await settle(t)
      continue
    }
    break
  }

  if (active(t) === playerId) {
    throw new Error(
      `endTurn: ${playerId} has points left and nothing legal to spend them ` +
        'on, so the turn cannot end.',
    )
  }
}

/** Burns whole turns until `playerId`'s NEXT one, with a fresh budget. */
async function nextTurnOf(t: Table, playerId: string): Promise<void> {
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
const HIGHEST = 0.999
/** Every roll after this comes up at the bottom of its range. */
const LOWEST = 0.0001
/** A hero / attack roll of 8. */
const MIDDLING = 0.6

const fixDice = (value: number) => jest.spyOn(Math, 'random').mockReturnValue(value)

/** A fixed sequence, then `rest` for everything after it. */
function scriptDice(sequence: number[], rest: number): void {
  const queue = [...sequence]
  jest.spyOn(Math, 'random').mockImplementation(() => queue.shift() ?? rest)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('a game played through', () => {
  afterEach(() => jest.restoreAllMocks())

  // --- The opening --------------------------------------------------------

  it('opens on the first seat with a full budget and a dealt hand', () => {
    const t = table()
    const view = see(t, t.game.playerOrder[0])

    expect(view.currentPlayerId).toBe(t.game.playerOrder[0])
    expect(seatOf(view, view.playerId).actionPoints).toBe(3)
    expect(view.hand).toHaveLength(5)
    expect(view.pendingWindows).toEqual([])
    expect(view.busy).toBe(false)
  })

  it('deals every seat a hand, a leader and an empty party', () => {
    const t = table()

    for (const playerId of SEATS) {
      const view = see(t, playerId)
      expect(view.hand).toHaveLength(5)
      expect(partyOf(view, playerId).leader.type).toBe(CardType.Leader)
      expect(partyOf(view, playerId).heroes).toEqual([])
      expect(seatOf(view, playerId).handCount).toBe(5)
    }
    // Six leaders, three seats, and no two parties led by the same card.
    const leaders = SEATS.map((id) => partyOf(board(t), id).leader.id)
    expect(new Set(leaders).size).toBe(SEATS.length)
  })

  // --- Turn rotation ------------------------------------------------------

  it('rotates through every seat and back to the first', async () => {
    const t = table()
    const seen: string[] = []

    for (let i = 0; i < SEATS.length + 1; i++) {
      seen.push(active(t))
      await endTurn(t)
    }

    expect(seen).toEqual([...t.game.playerOrder, t.game.playerOrder[0]])
  })

  it('resets the budget every turn', async () => {
    const t = table()

    await endTurn(t)

    expect(seatOf(board(t), active(t)).actionPoints).toBe(3)
  })

  it('leaves nothing open between turns', async () => {
    const t = table()

    for (let i = 0; i < 4; i++) await endTurn(t)

    const view = board(t)
    expect(view.pendingWindows).toEqual([])
    expect(view.busy).toBe(false)
  })

  it('refuses a player who acts out of turn, at no cost to them', async () => {
    const t = table()
    const idle = t.game.playerOrder[1]
    const before = see(t, idle)

    draw(t, idle)
    await settle(t)

    const after = see(t, idle)
    expect(after.hand).toHaveLength(before.hand.length)
    expect(seatOf(after, idle).actionPoints).toBe(
      seatOf(before, idle).actionPoints,
    )
  })

  // --- Drawing ------------------------------------------------------------

  it('a draw costs a point, grows the hand and shrinks the deck', async () => {
    const t = table()
    const playerId = active(t)
    const before = see(t, playerId)

    draw(t, playerId)
    await settle(t)

    const after = see(t, playerId)
    expect(after.hand).toHaveLength(before.hand.length + 1)
    expect(after.mainDeck.count).toBe(before.mainDeck.count - 1)
    expect(seatOf(after, playerId).actionPoints).toBe(
      seatOf(before, playerId).actionPoints - 1,
    )
    // The hand grew for its owner and stayed a number for everybody else.
    expect(seatOf(see(t, t.game.playerOrder[1]), playerId).handCount).toBe(
      after.hand.length,
    )
  })

  it('stops at an empty deck instead of drawing past it', async () => {
    // Five cards, four dealt: one draw empties it and the next has nowhere to
    // go. NOTE: the turn cannot end from here — there is no pass action and
    // every other move needs a card — which is the deck-exhaustion gap of §10
    // showing through, not a fault in the drive loop.
    const t = stacked({
      deck: ['hero-001', 'hero-002', 'hero-003', 'hero-004', 'hero-005'],
      slack: 1,
    })
    const playerId = active(t)

    draw(t, playerId)
    await settle(t)
    expect(see(t, playerId).mainDeck.count).toBe(0)

    const afterOne = see(t, playerId)
    draw(t, playerId)
    await settle(t)

    const afterTwo = see(t, playerId)
    expect(afterTwo.mainDeck.count).toBe(0)
    expect(afterTwo.hand).toHaveLength(afterOne.hand.length)
    expect(seatOf(afterTwo, playerId).actionPoints).toBe(
      seatOf(afterOne, playerId).actionPoints,
    )
  })

  // --- Playing a hero -----------------------------------------------------

  it('plays a hero nobody contests, and it joins the party', async () => {
    const t = stacked({ deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'] })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t) // the challenge, then the roll offer behind it

    const view = see(t, playerId)
    expect(partyOf(view, playerId).heroes.map((h) => h.card.id)).toEqual([
      'hero-044',
    ])
    expect(view.hand.map((c) => c.id)).not.toContain('hero-044')
    expect(view.pendingWindows).toEqual([])
    expect(seatOf(view, playerId).actionPoints).toBe(2)
  })

  it('a lost challenge un-plays the hero and discards it', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'challenge-102', 'challenge-103'],
    })
    const [defender, challenger] = t.game.playerOrder

    playHero(t, defender, 'hero-044')
    await windowFor(t, defender, ReactionWindowType.Challenge)

    // Challenger rolls 11, defender rolls 1 — the play is defeated.
    scriptDice([HIGHEST, LOWEST], LOWEST)
    react(t, new PlayChallengeReaction(actionId(), challenger, 'challenge-102', 'hero-044'))
    await settle(t)

    const view = see(t, defender)
    expect(partyOf(view, defender).heroes).toEqual([])
    expect(inDiscard(view, 'hero-044')).toBe(true)
    // The challenge card was spent either way — its own frame put it away.
    expect(inDiscard(view, 'challenge-102')).toBe(true)
    expect(see(t, challenger).hand.map((c) => c.id)).not.toContain('challenge-102')

    const resolved = payloads(t, GameEventType.ChallengeResolved)
    expect(resolved).toHaveLength(1)
    expect(resolved[0]['defenderWins']).toBe(false)
    // The point was spent before the snapshot, so the rollback cannot refund it.
    expect(seatOf(view, defender).actionPoints).toBe(2)
  })

  it('a survived challenge leaves the hero standing', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'challenge-102', 'challenge-103'],
    })
    const [defender, challenger] = t.game.playerOrder

    playHero(t, defender, 'hero-044')
    await windowFor(t, defender, ReactionWindowType.Challenge)

    // Challenger rolls 1, defender rolls 11.
    scriptDice([LOWEST, HIGHEST], HIGHEST)
    react(t, new PlayChallengeReaction(actionId(), challenger, 'challenge-102', 'hero-044'))
    await settle(t)

    const view = see(t, defender)
    expect(partyOf(view, defender).heroes.map((h) => h.card.id)).toEqual([
      'hero-044',
    ])
    expect(inDiscard(view, 'hero-044')).toBe(false)
    expect(inDiscard(view, 'challenge-102')).toBe(true)
    expect(payloads(t, GameEventType.ChallengeResolved)[0]['defenderWins']).toBe(
      true,
    )
  })

  it('only one challenge lands on a card, and the second is spent for nothing', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'challenge-102', 'challenge-103'],
    })
    const [defender, challenger] = t.game.playerOrder

    playHero(t, defender, 'hero-044')
    await windowFor(t, defender, ReactionWindowType.Challenge)

    fixDice(HIGHEST)
    react(t, new PlayChallengeReaction(actionId(), challenger, 'challenge-102', 'hero-044'))
    react(t, new PlayChallengeReaction(actionId(), challenger, 'challenge-103', 'hero-044'))
    await settle(t)

    expect(ofType(t, GameEventType.ChallengeStarted)).toHaveLength(1)
    // Both left the hand. A challenge card is spent when it is played, and the
    // window simply refuses to start a second contest.
    const view = see(t, challenger)
    expect(view.hand.map((c) => c.id)).not.toContain('challenge-102')
    expect(view.hand.map((c) => c.id)).not.toContain('challenge-103')
  })

  it('never offers a roll on a hero the challenge took away', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'challenge-102', 'challenge-103'],
    })
    const [defender, challenger] = t.game.playerOrder

    playHero(t, defender, 'hero-044')
    await windowFor(t, defender, ReactionWindowType.Challenge)

    scriptDice([HIGHEST, LOWEST], LOWEST)
    react(t, new PlayChallengeReaction(actionId(), challenger, 'challenge-102', 'hero-044'))
    await settle(t)

    // The offer is matched from the hero's position in the party, and a
    // defeated hero is not there to be matched (§6).
    expect(
      t.events.filter(
        (e) =>
          e.getType() === GameEventType.ReactionWindowOpened &&
          (e.getPayload() as { windowType?: string }).windowType ===
            ReactionWindowType.TaskChoice,
      ),
    ).toEqual([])
  })

  // --- Answering a confirm ------------------------------------------------

  it('takes up the roll a played hero is offered, for free', async () => {
    const t = stacked({ deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'] })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    const offer = await windowFor(t, playerId, ReactionWindowType.TaskChoice)

    // The answer is one of the options the screen was handed, not a value the
    // client invented.
    expect(offer.options).toContain(CONFIRM)
    fixDice(HIGHEST)
    answer(t, offer, CONFIRM)
    await settle(t)

    const rolls = payloads(t, GameEventType.DiceRolled)
    expect(rolls.map((p) => p['cardId'])).toContain('hero-044')
    expect(
      payloads(t, GameEventType.RollSuccess).map((p) => p['cardId']),
    ).toContain('hero-044')
    // One point for the play and nothing for the roll: the offer belongs to the
    // hero, and a task has no price (§1).
    expect(seatOf(see(t, playerId), playerId).actionPoints).toBe(2)
  })

  it('lets the offer lapse when the player says nothing', async () => {
    const t = stacked({ deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'] })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)

    expect(ofType(t, GameEventType.DiceRolled)).toEqual([])
    expect(partyOf(see(t, playerId), playerId).heroes[0].canRollOn).toBe(true)
  })

  // --- Rolling on a hero --------------------------------------------------

  it('spends the slot on a successful roll, and the screen stops offering it', async () => {
    const t = stacked({ deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'] })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)

    fixDice(HIGHEST)
    rollOnHero(t, playerId, 'hero-044')
    await settle(t)

    const view = see(t, playerId)
    expect(
      payloads(t, GameEventType.RollSuccess).map((p) => p['cardId']),
    ).toContain('hero-044')
    expect(partyOf(view, playerId).heroes[0].canRollOn).toBe(false)
    expect(seatOf(view, playerId).actionPoints).toBe(1)
  })

  it('spends the slot and the point on a failed roll too', async () => {
    // Whiskers asks for 11; a middling roll of 8 comes up short.
    const t = stacked({ deck: ['hero-037', 'hero-001', 'hero-002', 'hero-003'] })
    const playerId = active(t)

    playHero(t, playerId, 'hero-037')
    await settle(t)

    fixDice(MIDDLING)
    rollOnHero(t, playerId, 'hero-037')
    await settle(t)

    const view = see(t, playerId)
    expect(
      payloads(t, GameEventType.RollFailed).map((p) => p['cardId']),
    ).toContain('hero-037')
    // markAbilityUsed runs before the frame opens, so the rollback cannot
    // refund the slot (§1).
    expect(partyOf(view, playerId).heroes[0].canRollOn).toBe(false)
    expect(seatOf(view, playerId).actionPoints).toBe(1)
    expect(partyOf(view, playerId).heroes.map((h) => h.card.id)).toEqual([
      'hero-037',
    ])
  })

  /**
   * Whiskers asks for 11 and rolls 8; modifier-086 is printed `[3, -1]`, so one
   * face saves the roll and the other sinks it. That is what makes the pick
   * observable — an unanswered value choice on your own roll falls to the
   * HIGHEST, so picking 3 alone would pass with no submission at all.
   */
  const failingRoll = () =>
    stacked({ deck: ['hero-037', 'modifier-086', 'hero-001', 'hero-002'] })

  it('turns a failing roll into a passing one with a modifier card', async () => {
    const t = failingRoll()
    const playerId = active(t)

    playHero(t, playerId, 'hero-037')
    await settle(t)

    fixDice(MIDDLING)
    rollOnHero(t, playerId, 'hero-037')
    await windowFor(t, playerId, ReactionWindowType.Modifier)

    // The play spends the card; what it is WORTH is the card's own entry, and
    // arrives as a value the player picks off its printed face (§7).
    react(t, new PlayModifierReaction(actionId(), playerId, 'modifier-086', playerId))
    const values = await windowFor(t, playerId, ReactionWindowType.ValueChoice)
    expect(values.options).toEqual([3, -1])
    answer(t, values, 3)
    await settle(t)

    const view = see(t, playerId)
    const applied = payloads(t, GameEventType.ModifierApplied)
    expect(applied).toHaveLength(1)
    expect(applied[0]['value']).toBe(3)
    expect(applied[0]['finalRoll']).toBe(11)
    expect(
      payloads(t, GameEventType.RollSuccess).map((p) => p['cardId']),
    ).toContain('hero-037')
    expect(ofType(t, GameEventType.RollFailed)).toEqual([])
    // Spent, and put away by the frame it was spent into.
    expect(view.hand.map((c) => c.id)).not.toContain('modifier-086')
    expect(inDiscard(view, 'modifier-086')).toBe(true)
    expect(partyOf(view, playerId).instanceCards).toEqual([])
  })

  it('lands the number the player picked, not the one silence would have', async () => {
    const t = failingRoll()
    const playerId = active(t)

    playHero(t, playerId, 'hero-037')
    await settle(t)

    fixDice(MIDDLING)
    rollOnHero(t, playerId, 'hero-037')
    await windowFor(t, playerId, ReactionWindowType.Modifier)

    react(t, new PlayModifierReaction(actionId(), playerId, 'modifier-086', playerId))
    const values = await windowFor(t, playerId, ReactionWindowType.ValueChoice)
    answer(t, values, -1)
    await settle(t)

    expect(payloads(t, GameEventType.ModifierApplied)[0]['value']).toBe(-1)
    expect(
      payloads(t, GameEventType.RollFailed).map((p) => p['cardId']),
    ).toContain('hero-037')
    // Spent all the same: a card is paid for when it is played.
    expect(inDiscard(see(t, playerId), 'modifier-086')).toBe(true)
  })

  it('will not roll on a hero twice in one turn', async () => {
    const t = stacked({ deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'] })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)

    fixDice(HIGHEST)
    rollOnHero(t, playerId, 'hero-044')
    await settle(t)
    const afterFirst = see(t, playerId)

    rollOnHero(t, playerId, 'hero-044')
    await settle(t)

    expect(ofType(t, GameEventType.DiceRolled)).toHaveLength(1)
    expect(seatOf(see(t, playerId), playerId).actionPoints).toBe(
      seatOf(afterFirst, playerId).actionPoints,
    )
  })

  it('gives the slot back at the start of the next turn', async () => {
    const t = stacked({ seats: SEATS, deck: ['hero-044'] })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)
    fixDice(HIGHEST)
    rollOnHero(t, playerId, 'hero-044')
    await settle(t)
    expect(partyOf(see(t, playerId), playerId).heroes[0].canRollOn).toBe(false)

    await nextTurnOf(t, playerId)

    expect(partyOf(see(t, playerId), playerId).heroes[0].canRollOn).toBe(true)
  })

  // --- The leader ---------------------------------------------------------

  it('activates a leader without dice and without a window', async () => {
    const t = stacked({ deck: ['hero-001', 'hero-002', 'hero-003', 'hero-004'] })
    const playerId = active(t)
    const leaderId = partyOf(see(t, playerId), playerId).leader.id

    rollOnLeader(t, playerId, leaderId)
    await settle(t)

    const view = see(t, playerId)
    expect(seatOf(view, playerId).actionPoints).toBe(2)
    expect(ofType(t, GameEventType.DiceRolled)).toEqual([])
    expect(partyOf(view, playerId).canRollOnLeader).toBe(false)
  })

  it('activates a leader once a turn', async () => {
    const t = stacked({ deck: ['hero-001', 'hero-002', 'hero-003', 'hero-004'] })
    const playerId = active(t)
    const leaderId = partyOf(see(t, playerId), playerId).leader.id

    rollOnLeader(t, playerId, leaderId)
    await settle(t)
    rollOnLeader(t, playerId, leaderId)
    await settle(t)

    expect(seatOf(see(t, playerId), playerId).actionPoints).toBe(2)
  })

  // --- Items --------------------------------------------------------------

  it('equips an item onto a hero already in the party', async () => {
    const t = stacked({ deck: ['hero-044', 'item-067', 'hero-001', 'hero-002'] })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)
    playItem(t, playerId, 'item-067', 'hero-044')
    await settle(t)

    const view = see(t, playerId)
    expect(partyOf(view, playerId).heroes[0].equippedItem?.id).toBe('item-067')
    expect(view.hand.map((c) => c.id)).not.toContain('item-067')
    expect(seatOf(view, playerId).actionPoints).toBe(1)
  })

  it('refuses a second item on the same hero', async () => {
    const t = stacked({ deck: ['hero-044', 'item-067', 'item-068'], handSize: 3 })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)
    playItem(t, playerId, 'item-067', 'hero-044')
    await settle(t)
    playItem(t, playerId, 'item-068', 'hero-044')
    await settle(t)

    const view = see(t, playerId)
    expect(partyOf(view, playerId).heroes[0].equippedItem?.id).toBe('item-067')
    expect(view.hand.map((c) => c.id)).toContain('item-068')
    expect(seatOf(view, playerId).actionPoints).toBe(1)
  })

  // --- Magic --------------------------------------------------------------

  it('runs a magic card and leaves it in the discard, not on the table', async () => {
    // Critical Boost: DRAW 3 and DISCARD a card.
    const t = stacked({
      deck: [
        'magic-053', 'hero-001', 'hero-002', 'hero-003',
        'hero-004', 'hero-005', 'hero-006',
      ],
    })
    const playerId = active(t)

    playMagic(t, playerId, 'magic-053')
    const pick = await windowFor(t, playerId, ReactionWindowType.CardChoice)

    // Three drawn, and the whole hand offered to pay with.
    expect(pick.options).toContain('hero-004')
    expect(pick.options).toContain('hero-001')
    answer(t, pick, 'hero-001')
    await settle(t)

    const view = see(t, playerId)
    expect(view.hand.map((c) => c.id)).toEqual(
      expect.arrayContaining(['hero-004', 'hero-005', 'hero-006']),
    )
    expect(view.hand.map((c) => c.id)).not.toContain('hero-001')
    expect(inDiscard(view, 'hero-001')).toBe(true)
    // The zone is not a waiting room: the card leaves when its run ends (§1).
    expect(inDiscard(view, 'magic-053')).toBe(true)
    expect(partyOf(view, playerId).instanceCards).toEqual([])
  })

  it('rolls a defeated magic card back before its ability can run', async () => {
    const t = stacked({
      deck: [
        'magic-053', 'hero-001', 'challenge-102', 'hero-002',
        'hero-003', 'hero-004', 'hero-005',
      ],
    })
    const [caster, challenger] = t.game.playerOrder
    const handBefore = see(t, caster).hand.length

    playMagic(t, caster, 'magic-053')
    await windowFor(t, caster, ReactionWindowType.Challenge)

    scriptDice([HIGHEST, LOWEST], LOWEST)
    react(t, new PlayChallengeReaction(actionId(), challenger, 'challenge-102', 'magic-053'))
    await settle(t)

    const view = see(t, caster)
    // Its steps trigger on the SETTLED frame, and a defeated card is not among
    // the sources when that event goes out — so nothing was drawn (§1).
    expect(view.hand).toHaveLength(handBefore - 1)
    expect(inDiscard(view, 'magic-053')).toBe(true)
    expect(partyOf(view, caster).instanceCards).toEqual([])
  })

  // --- Monsters -----------------------------------------------------------

  it('offers no monster to a party that cannot field one', async () => {
    const t = table()
    const playerId = active(t)
    const view = see(t, playerId)

    // Every printed monster asks for at least one hero, and no party has one.
    expect(view.attackableMonsterIds).toEqual([])

    const needy = view.monsterRow[0]
    attack(t, playerId, needy.id)
    await settle(t)

    expect(seatOf(see(t, playerId), playerId).actionPoints).toBe(3)
    expect(ofType(t, GameEventType.DiceRolled)).toEqual([])
  })

  it('offers a monster the moment the party can field it', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
      monsters: ['monster-128'],
    })
    const playerId = active(t)

    expect(see(t, playerId).attackableMonsterIds).not.toContain('monster-128')

    playHero(t, playerId, 'hero-044')
    await settle(t)

    // Arctic Aries asks for one hero of any class.
    expect(see(t, playerId).attackableMonsterIds).toContain('monster-128')
  })

  it('slays a monster, takes it into the party, and the row refills', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
      monsters: ['monster-128'],
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)
    const deckBefore = see(t, playerId).monsterDeck.count

    fixDice(HIGHEST) // 12, against a requirement of 10
    attack(t, playerId, 'monster-128')
    await settle(t)

    const view = see(t, playerId)
    expect(partyOf(view, playerId).monsters.map((m) => m.id)).toEqual([
      'monster-128',
    ])
    expect(view.monsterRow.map((m) => m.id)).not.toContain('monster-128')
    // The row is what a player attacks FROM, so it is refilled behind them.
    expect(view.monsterRow).toHaveLength(3)
    expect(view.monsterDeck.count).toBe(deckBefore - 1)
    expect(seatOf(view, playerId).actionPoints).toBe(0)
  })

  it('leaves a monster that fought back exactly where it was', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
      monsters: ['monster-128'],
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)

    fixDice(LOWEST) // 2, inside Arctic Aries' fight-back band of 6 and under
    attack(t, playerId, 'monster-128')
    await settle(t)

    const view = see(t, playerId)
    expect(ofType(t, GameEventType.MonsterFoughtBack)).toHaveLength(1)
    expect(ofType(t, GameEventType.MonsterSlain)).toEqual([])
    expect(view.monsterRow.map((m) => m.id)).toContain('monster-128')
    expect(partyOf(view, playerId).monsters).toEqual([])
    // Priced in action points, not in the hero's once-per-turn slot.
    expect(seatOf(view, playerId).actionPoints).toBe(0)
    expect(partyOf(view, playerId).heroes[0].canRollOn).toBe(true)
  })

  it('says nothing at all about a miss', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
      monsters: ['monster-128'],
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)

    fixDice(MIDDLING) // 8: over the fight-back band, under the requirement
    attack(t, playerId, 'monster-128')
    await settle(t)

    const view = see(t, playerId)
    expect(ofType(t, GameEventType.MonsterSlain)).toEqual([])
    expect(ofType(t, GameEventType.MonsterFoughtBack)).toEqual([])
    expect(view.monsterRow.map((m) => m.id)).toContain('monster-128')
    expect(view.monsterRow).toHaveLength(3)
  })

  it('reads the printed bands off the card it is attacking', () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
      monsters: ['monster-128'],
    })
    const monster = see(t, active(t)).monsterRow.find(
      (m) => m.id === 'monster-128',
    ) as MonsterCardData

    // The numbers the three tests above are written against, on the wire.
    expect(monster.higherReq).toBe(10)
    expect(monster.lowerReq).toBe(6)
  })

  // --- Winning ------------------------------------------------------------

  it('ends the game when a win condition is met', async () => {
    // One slain monster wins at this table.
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
      monsters: ['monster-128'],
      winAt: 1,
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)
    fixDice(HIGHEST)
    attack(t, playerId, 'monster-128')
    await settle(t)

    // Play (1) plus attack (2) is the whole budget, so the turn ends by
    // itself — and the win is checked as the turn ends, not as it is won.
    const ended = payloads(t, GameEventType.GameEnded)
    expect(ended).toHaveLength(1)
    expect(ended[0]['winnerId']).toBe(playerId)
  })

  it('plays on while nobody has met one', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
      monsters: ['monster-128'],
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)
    fixDice(HIGHEST)
    attack(t, playerId, 'monster-128')
    await settle(t)

    expect(ofType(t, GameEventType.GameEnded)).toEqual([])
    expect(partyOf(see(t, playerId), playerId).monsters).toHaveLength(1)
  })

  // --- Nothing gets stuck -------------------------------------------------

  it(
    'survives a long run of turns with no window or pipeline left behind',
    async () => {
      const t = table()

      for (let turn = 0; turn < 9; turn++) {
        const playerId = active(t)
        const view = see(t, playerId)

        const heroId = heldOfType(view, CardType.Hero)
        if (heroId && seatOf(view, playerId).actionPoints > 0) {
          playHero(t, playerId, heroId)
          await settle(t)
        }

        const rollable = partyOf(see(t, playerId), playerId).heroes.find(
          (h) => h.canRollOn,
        )
        if (rollable && seatOf(see(t, playerId), playerId).actionPoints > 0) {
          rollOnHero(t, playerId, rollable.card.id)
          await settle(t)
        }

        const attackable = see(t, playerId).attackableMonsterIds[0]
        if (attackable && seatOf(see(t, playerId), playerId).actionPoints >= 2) {
          attack(t, playerId, attackable)
          await settle(t)
        }

        if (ofType(t, GameEventType.GameEnded).length > 0) break

        await endTurn(t)

        const between = board(t)
        expect(between.pendingWindows).toEqual([])
        expect(between.busy).toBe(false)
      }

      expect(board(t).currentPlayerId).toBeDefined()
    },
    60000,
  )

  it('finishes its turns even when nobody answers anything', async () => {
    const t = stacked({ deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'] })
    const playerId = active(t)

    // Play, then walk away: the challenge lapses, the roll offer lapses, and
    // the turn still rolls over. A timeout resolves; it never rolls back (§4).
    playHero(t, playerId, 'hero-044')
    await endTurn(t)

    expect(active(t)).not.toBe(playerId)
    expect(board(t).pendingWindows).toEqual([])
    expect(partyOf(board(t), playerId).heroes).toHaveLength(1)
  })

  // --- Isolation between simultaneous games -------------------------------

  it('two games run side by side without touching each other', async () => {
    const one = table()
    const two = table()

    await endTurn(one)

    expect(active(one)).toBe(one.game.playerOrder[1])
    expect(active(two)).toBe(two.game.playerOrder[0])
    expect(seatOf(board(two), active(two)).actionPoints).toBe(3)
    expect(board(two).mainDeck.count).toBe(
      baseGameCards.filter((c) =>
        [
          CardType.Hero,
          CardType.Item,
          CardType.Magic,
          CardType.Modifier,
          CardType.Challenge,
        ].includes(c.type),
      ).length -
        SEATS.length * 5,
    )
  })

  it('keeps two games’ card objects apart', () => {
    const one = table()
    const two = table()

    const first = see(one, one.game.playerOrder[0]).hand[0]
    first.name = 'tampered'

    // The view hands out a copy of the printed record, so writing to one
    // table's screen cannot reach another's.
    const same = see(two, two.game.playerOrder[0]).hand.find(
      (c) => c.id === first.id,
    )
    if (same) expect(same.name).not.toBe('tampered')
    expect(
      see(one, one.game.playerOrder[0]).hand[0].name,
    ).not.toBe('tampered')
  })
})
