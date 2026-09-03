import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import type { AddressInfo } from 'node:net'
import {
  GAME_COMMAND,
  GAME_COMPLETED,
  GAME_SNAPSHOT,
  GAME_STARTED,
  GamePhase,
  ReactionWindowType,
} from 'shared'
import type {
  CommandResult,
  GameSnapshot,
  PendingWindowView,
  PlayerView,
} from 'shared'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { CONFIRM } from '../game/reactions/task-choice-window'
import {
  HIGHEST,
  LOWEST,
  MIDDLING,
  fixDice,
  scriptDice,
  until,
} from '../game/setup/play-through-helpers'
import { GameRegistryService } from './game-registry.service'
import { GameServerModule } from './game-server.module'
import { GAME_SESSION_RESOLVER } from './session/game-session.resolver'
import { InMemorySessionResolver, dealStacked, tokenOf } from './spec-helpers'

// ---------------------------------------------------------------------------
// The capstone: `setup/full-game.spec.ts` replayed over sockets. Same stacked
// deal, same scripted dice, same moves — but every move is a `game:command`
// from one of three socket.io clients, and every fact is read from the
// snapshots those clients received, never from the engine. If it can be
// played in the harness and not here, the transport is the bug.
//
// The harness reads events to confirm what happened; a browser has no
// events, only the board (plan §4.3, Q4). So every assertion below is one a
// screen could make: where a card is, whose turn it is, what a window says.
// ---------------------------------------------------------------------------

const ALICE = 'alice'
const BOB = 'bob'
const CAROL = 'carol'
const SEATS = [ALICE, BOB, CAROL]

/**
 * Every non-monster card on the table, counted the way a seat sees it: named
 * where face up, counted where face down. The deal is the only source of
 * cards, so this total must never move.
 */
function mainCardsOnTable(v: PlayerView): number {
  const others = v.seats
    .filter((s) => s.playerId !== v.playerId)
    .reduce((n, s) => n + s.handCount, 0)
  const inParties = v.parties.reduce(
    (n, p) =>
      n +
      p.heroes.length +
      p.heroes.filter((h) => h.equippedItem).length +
      p.instanceCards.length,
    0,
  )
  return v.hand.length + others + v.mainDeck.count + v.discardPile.length + inParties
}

function monstersOnTable(v: PlayerView): number {
  return (
    v.monsterRow.length +
    v.monsterDeck.count +
    v.parties.reduce((n, p) => n + p.monsters.length, 0)
  )
}

/** The face-up ids one seat can name. No card may be in two places. */
function namedIds(v: PlayerView): string[] {
  return [
    ...v.hand.map((c) => c.id),
    ...v.discardPile.map((c) => c.id),
    ...v.monsterRow.map((c) => c.id),
    ...v.parties.flatMap((p) => [
      ...p.heroes.map((h) => h.card.id),
      ...p.heroes.flatMap((h) => (h.equippedItem ? [h.equippedItem.id] : [])),
      ...p.instanceCards.map((c) => c.id),
      ...p.monsters.map((c) => c.id),
    ]),
  ]
}

const partyOf = (v: PlayerView, playerId: string) =>
  v.parties.find((p) => p.playerId === playerId)!
const seatOf = (v: PlayerView, playerId: string) =>
  v.seats.find((s) => s.playerId === playerId)!
const inDiscard = (v: PlayerView, cardId: string) =>
  v.discardPile.some((c) => c.id === cardId)

describe('a full game over sockets', () => {
  let app: INestApplication
  let url: string
  let registry: GameRegistryService
  const sockets: Record<string, Socket> = {}
  /** What each browser is currently showing: the highest version it received. */
  const latest: Record<string, GameSnapshot> = {}
  const opening: Record<string, GameSnapshot> = {}
  const completed: Record<string, Promise<GameSnapshot>> = {}

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [GameServerModule],
    })
      .overrideProvider(GAME_SESSION_RESOLVER)
      .useValue(new InMemorySessionResolver())
      .compile()

    app = module.createNestApplication({ logger: false })
    await app.listen(0)
    const { port } = app.getHttpServer().address() as AddressInfo
    url = `http://127.0.0.1:${port}`
    registry = app.get(GameRegistryService)
  })

  afterAll(async () => {
    for (const socket of Object.values(sockets)) socket.disconnect()
    await app.close()
  })

  afterEach(() => jest.restoreAllMocks())

  /** A browser: keeps the newest snapshot, whichever event carried it. */
  function open(seat: string): Promise<void> {
    const socket = io(url, {
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
      extraHeaders: { cookie: `htsr_session=${tokenOf(seat)}` },
    })
    sockets[seat] = socket
    const keep = (snapshot: GameSnapshot) => {
      if (!latest[seat] || snapshot.version > latest[seat].version) {
        latest[seat] = snapshot
      }
    }
    socket.on(GAME_SNAPSHOT, keep)
    socket.on(GAME_COMPLETED, keep)
    completed[seat] = new Promise((resolve) => socket.once(GAME_COMPLETED, resolve))
    return new Promise((resolve, reject) => {
      socket.once(GAME_STARTED, (snapshot: GameSnapshot) => {
        opening[seat] = snapshot
        keep(snapshot)
        resolve()
      })
      socket.once('connect_error', reject)
    })
  }

  const send = (
    seat: string,
    type: string,
    payload: unknown = {},
  ): Promise<CommandResult> =>
    sockets[seat].emitWithAck(GAME_COMMAND, {
      commandId: crypto.randomUUID(),
      type,
      payload,
    })

  async function accepted(seat: string, type: string, payload: unknown = {}) {
    const ack = await send(seat, type, payload)
    expect(ack).toMatchObject({ accepted: true })
  }

  const see = (seat: string): PlayerView => latest[seat].state
  const active = () => see(ALICE).currentPlayerId

  /** Waits until a seat's screen shows something. */
  const shows = (seat: string, what: string, check: (v: PlayerView) => boolean) =>
    until(() => !!latest[seat] && check(see(seat)), `${seat} to see ${what}`)

  /** Waits for a seat's screen to show the board at rest. */
  const settled = (seat = ALICE) =>
    shows(seat, 'an idle board', (v) => !v.busy && v.pendingWindows.length === 0)

  /** Waits for a window of `type` on a seat's screen, theirs to answer or not. */
  async function windowOn(
    seat: string,
    type: ReactionWindowType,
    mine = false,
  ): Promise<PendingWindowView> {
    let found: PendingWindowView | undefined
    await shows(seat, `a ${type} window`, (v) => {
      found = v.pendingWindows.find((w) => w.type === type && (!mine || w.isYours))
      return !!found
    })
    return found!
  }

  it('is played from the first turn to game-completed, and every seat may leave', async () => {
    const running = dealStacked(registry, {
      seats: SEATS,
      handSize: 5,
      winAt: 1,
      slack: 10,
      monsters: ['monster-130'], // Terratuga: one hero of any class, 11 to slay, 7 and under fights back
      deck: [
        // Alice
        'hero-044', // Napping Nibbles — played, challenged, defeated
        'hero-037', // Whiskers (needs 11) — played, challenged, survives; rolled on twice
        'modifier-086', // [3, -1] — turns Whiskers' 8 into 11
        'magic-053', // Critical Boost — draw 3, discard 1, pauses on a choice
        'item-067', // Fighter Mask — equipped onto Whiskers
        // Bob
        'challenge-102', // spent on Napping Nibbles
        'hero-001', // Bad Axe — Bob's hero, so he can attack
        'hero-004',
        'hero-005',
        'hero-006',
        // Carol
        'challenge-103', // spent on Whiskers
        'hero-002',
        'hero-003',
        'hero-008',
        'hero-009',
        // Carol's redraw takes the next five
        'hero-010', // Carol's hero, so she can attack
        'hero-011',
        'hero-012',
        'hero-013',
        'hero-014',
        // Critical Boost takes the next three
        'hero-015', // the one Alice discards
        'hero-016',
        'hero-017',
      ],
    })

    // ----- Three browsers sit down; the third one starts the table --------
    await Promise.all(SEATS.map(open))

    for (const seat of SEATS) {
      expect(opening[seat].gameId).toBe(running.game.gameId)
      expect(opening[seat].state.phase).toBe(GamePhase.Turns)
      expect(opening[seat].state.playerId).toBe(seat)
      expect(opening[seat].state.hand).toHaveLength(5)
    }
    const mainCards = mainCardsOnTable(opening[ALICE].state)
    const monsters = monstersOnTable(opening[ALICE].state)
    expect(opening[ALICE].state.mainDeck.count).toBe(10)
    expect(seatOf(opening[BOB].state, ALICE).handCount).toBe(5)
    await settled()

    // ----- Turn 1: Alice ---------------------------------------------------
    expect(active()).toBe(ALICE)

    // A play that loses its challenge: challenger 11, defender 1.
    await accepted(ALICE, 'PlayHero', { cardId: 'hero-044' })
    const first = await windowOn(BOB, ReactionWindowType.Challenge)
    expect(first.cardId).toBe('hero-044')
    scriptDice([HIGHEST, LOWEST], LOWEST)
    await accepted(BOB, 'Challenge', { cardId: 'challenge-102', targetedCardId: 'hero-044' })
    await settled()

    expect(partyOf(see(ALICE), ALICE).heroes).toEqual([])
    expect(inDiscard(see(CAROL), 'hero-044')).toBe(true)
    expect(inDiscard(see(CAROL), 'challenge-102')).toBe(true)
    expect(see(BOB).hand.map((c) => c.id)).not.toContain('challenge-102')

    // A play that survives its challenge: challenger 1, defender 11 — then
    // the roll it is offered, taken up, comes up 8 against Whiskers' 11.
    await accepted(ALICE, 'PlayHero', { cardId: 'hero-037' })
    await windowOn(CAROL, ReactionWindowType.Challenge)
    scriptDice([LOWEST, HIGHEST], HIGHEST)
    await accepted(CAROL, 'Challenge', { cardId: 'challenge-103', targetedCardId: 'hero-037' })
    const offer = await windowOn(ALICE, ReactionWindowType.TaskChoice, true)
    expect(offer.options).toContain(CONFIRM)
    fixDice(MIDDLING)
    await accepted(ALICE, 'SubmitChoice', { windowId: offer.windowId, choice: CONFIRM })
    await settled()

    expect(partyOf(see(BOB), ALICE).heroes.map((h) => h.card.id)).toEqual(['hero-037'])
    expect(partyOf(see(BOB), ALICE).heroes[0].equippedItem).toBeUndefined()
    expect(seatOf(see(ALICE), ALICE).actionPoints).toBe(1)

    // One point left and nothing worth spending it on: pass.
    await accepted(ALICE, 'EndTurn')
    await shows(BOB, 'his turn', (v) => v.currentPlayerId === BOB)
    await settled(BOB)

    // ----- Turn 1: Bob -----------------------------------------------------
    await accepted(BOB, 'PlayHero', { cardId: 'hero-001' })
    await settled(BOB) // nobody challenges; the roll offer lapses
    expect(see(BOB).attackableMonsterIds).toContain('monster-130')
    // The party requirement, not the turn: Whiskers qualifies Alice too, and
    // it is the turn banner that greys her button out.
    expect(see(ALICE).attackableMonsterIds).toContain('monster-130')
    expect(see(CAROL).attackableMonsterIds).toEqual([])

    // A 2 is inside Terratuga's fight-back band.
    fixDice(LOWEST)
    await accepted(BOB, 'AttackMonster', { monsterId: 'monster-130' })
    await shows(CAROL, 'her turn', (v) => v.currentPlayerId === CAROL)
    await settled(CAROL)

    expect(see(CAROL).monsterRow.map((m) => m.id)).toContain('monster-130')
    expect(partyOf(see(CAROL), BOB).monsters).toEqual([])
    // Play (1) plus attack (2) is the whole budget.
    expect(active()).toBe(CAROL)

    // ----- Turn 1: Carol ---------------------------------------------------
    // Four cards left after the challenge; redraw discards them and draws five.
    await accepted(CAROL, 'ReDraw')
    await shows(ALICE, 'her turn', (v) => v.currentPlayerId === ALICE)
    await settled()

    expect(see(CAROL).hand.map((c) => c.id)).toEqual([
      'hero-010',
      'hero-011',
      'hero-012',
      'hero-013',
      'hero-014',
    ])
    expect(seatOf(see(ALICE), CAROL).handCount).toBe(5)
    expect(['hero-002', 'hero-003', 'hero-008', 'hero-009'].every((id) => inDiscard(see(ALICE), id))).toBe(true)

    // ----- Turn 2: Alice ---------------------------------------------------
    expect(partyOf(see(ALICE), ALICE).heroes[0].canRollOn).toBe(true)

    // Rolling on Whiskers with an action: 8 again, and this time a modifier
    // played on the roll turns it into 11.
    fixDice(MIDDLING)
    await accepted(ALICE, 'RollOnHero', { heroId: 'hero-037' })
    const roll = await windowOn(ALICE, ReactionWindowType.Modifier)
    expect(roll.detail).toMatchObject({ rollerId: ALICE, baseRoll: 8 })
    await accepted(ALICE, 'ApplyModifier', {
      cardId: 'modifier-086',
      targetPlayerId: ALICE,
      value: 3,
    })
    await shows(BOB, 'the modifier land', (v) => {
      const w = v.pendingWindows.find((x) => x.type === ReactionWindowType.Modifier)
      return !!w && w.detail?.['finalRoll'] === 11
    })
    const whiskersSteal = await windowOn(
      ALICE,
      ReactionWindowType.CardChoice,
      true,
    )
    expect(whiskersSteal.options).toContain('hero-001')
    await accepted(ALICE, 'SubmitChoice', {
      windowId: whiskersSteal.windowId,
      choice: 'hero-001',
    })
    const whiskersDestroy = await windowOn(
      ALICE,
      ReactionWindowType.CardChoice,
      true,
    )
    expect(whiskersDestroy.options).toContain('hero-001')
    await accepted(ALICE, 'SubmitChoice', {
      windowId: whiskersDestroy.windowId,
      choice: 'hero-001',
    })
    await settled()

    expect(inDiscard(see(BOB), 'modifier-086')).toBe(true)
    expect(inDiscard(see(ALICE), 'hero-001')).toBe(true)
    expect(partyOf(see(BOB), ALICE).heroes[0].canRollOn).toBe(false)

    // Critical Boost: draw three, pause on which to discard. The options
    // reach Alice alone.
    await accepted(ALICE, 'PlayMagic', { cardId: 'magic-053' })
    const pick = await windowOn(ALICE, ReactionWindowType.CardChoice, true)
    expect(pick.options).toEqual(expect.arrayContaining(['hero-015', 'hero-016', 'hero-017']))
    const bobsLook = await windowOn(BOB, ReactionWindowType.CardChoice)
    expect(bobsLook.isYours).toBe(false)
    expect(bobsLook.options).toBeUndefined()
    await accepted(ALICE, 'SubmitChoice', { windowId: pick.windowId, choice: 'hero-015' })
    await settled()

    const boosted = see(ALICE)
    expect(boosted.hand.map((c) => c.id)).toEqual(expect.arrayContaining(['hero-016', 'hero-017', 'item-067']))
    expect(inDiscard(boosted, 'hero-015')).toBe(true)
    expect(inDiscard(boosted, 'magic-053')).toBe(true)
    expect(partyOf(boosted, ALICE).instanceCards).toEqual([])

    // The mask goes onto Whiskers, and that is the last point.
    await accepted(ALICE, 'PlayItem', { cardId: 'item-067', targetHeroId: 'hero-037' })
    await shows(BOB, 'his turn', (v) => v.currentPlayerId === BOB)
    await settled(BOB)

    expect(partyOf(see(CAROL), ALICE).heroes[0].equippedItem?.id).toBe('item-067')

    // ----- Turn 2: Bob -----------------------------------------------------
    const leaderId = partyOf(see(BOB), BOB).leader.id
    expect(partyOf(see(BOB), BOB).canRollOnLeader).toBe(true)
    await accepted(BOB, 'RollOnLeader', { leaderId })
    await settled(BOB)

    expect(partyOf(see(BOB), BOB).canRollOnLeader).toBe(false)
    expect(seatOf(see(BOB), BOB).actionPoints).toBe(2)

    await accepted(BOB, 'EndTurn')
    await shows(CAROL, 'her turn', (v) => v.currentPlayerId === CAROL)
    await settled(CAROL)

    // ----- Turn 2: Carol ---------------------------------------------------
    await accepted(CAROL, 'PlayHero', { cardId: 'hero-010' })
    await settled(CAROL)
    expect(see(CAROL).attackableMonsterIds).toContain('monster-130')

    // A 12 slays Terratuga, and one monster wins this table.
    expect(see(ALICE).winnerId).toBeUndefined()
    fixDice(HIGHEST)
    await accepted(CAROL, 'AttackMonster', { monsterId: 'monster-130' })
    const ends = await Promise.all(SEATS.map((seat) => completed[seat]))

    for (const [i, seat] of SEATS.entries()) {
      expect(ends[i].state.playerId).toBe(seat)
      expect(ends[i].state.phase).toBe(GamePhase.Concluded)
      expect(ends[i].state.winnerId).toBe(CAROL)
      expect(ends[i].version).toBe(ends[0].version)
      expect(ends[i].state.pendingWindows).toEqual([])
      expect(ends[i].state.busy).toBe(false)
    }
    const end = ends[SEATS.indexOf(CAROL)].state
    expect(partyOf(end, CAROL).monsters.map((m) => m.id)).toEqual(['monster-130'])
    expect(end.monsterRow).toHaveLength(3)
    expect(end.monsterRow.map((m) => m.id)).not.toContain('monster-130')

    // ----- Nothing was lost and nothing was doubled, on any screen ---------
    for (const seat of SEATS) {
      const v = see(seat)
      expect(v.phase).toBe(GamePhase.Concluded)
      expect(mainCardsOnTable(v)).toBe(mainCards)
      expect(monstersOnTable(v)).toBe(monsters)
      const ids = namedIds(v)
      expect(new Set(ids).size).toBe(ids.length)
    }

    // ----- And everybody goes back to the lobby ---------------------------
    for (const seat of SEATS) await accepted(seat, 'LeaveGame')
    expect(registry.get(running.game.gameId)).toBeUndefined()
  }, 60_000)
})
