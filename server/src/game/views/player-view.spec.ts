import {
  CardType,
  GameConfig,
  PassiveType,
  ReactionWindowType,
  GamePhase,
} from 'shared'
import { defaultGameConfig } from '../config/game-config'
import { baseGameCards } from '../../data/base-game-cards'
import { createGame, startGame, Game } from '../setup/create-game'
import { playerView } from './player-view'
import { DrawCardAction } from '../actions/draw-card-action'
import { PlayHeroAction } from '../actions/play-hero-action'
import { isActivatable } from '../repositories/ability-repository'

// ---------------------------------------------------------------------------
// The projection, pinned from both sides: what a player IS told, and what no
// player is ever told about anybody else.
//
// A leak here is silent — the view still renders, it just renders too much —
// so the negative assertions are the point of this file, and they are written
// against the whole serialised payload rather than field by field. A new field
// that carries a hidden id fails `everySeenId` even if nobody remembered to
// write a test for that field.
// ---------------------------------------------------------------------------

const SEATS = ['alice', 'bob', 'carol']

const TEST_CONFIG: GameConfig = {
  ...defaultGameConfig,
  timeControl: { ...defaultGameConfig.timeControl, reactionCountdownMs: 50 },
}

function dealt(): Game {
  return createGame(SEATS, { config: TEST_CONFIG })
}

/**
 * A deal whose main deck holds only `types`. Leaders and monsters ride along
 * because a table cannot be built without them — everything else is what the
 * hands are dealt from, so a case that needs a hero in hand gets one.
 */
function dealtFrom(...types: CardType[]): Game {
  const keep = new Set([CardType.Leader, CardType.Monster, ...types])
  return createGame(SEATS, {
    config: TEST_CONFIG,
    cards: baseGameCards.filter((card) => keep.has(card.type)),
  })
}

/**
 * A deal whose leaders carry no standing roll bonus (the Divine Arrow, the
 * Fist of Reason and the Charismatic Song each seed one), so a roll's bonus
 * list means exactly what the case says. Was the suite's one nondeterministic
 * test until 2026-09-04.
 */
function dealtQuiet(): Game {
  const quiet = new Set(['leader-117', 'leader-120', 'leader-121'])
  return createGame(SEATS, {
    config: TEST_CONFIG,
    cards: baseGameCards.filter(
      (card) => card.type !== CardType.Leader || quiet.has(card.id),
    ),
  })
}

/** Every card id anywhere in a serialised view — the leak detector. */
function everySeenId(view: unknown): string[] {
  const found: string[] = []
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (key === 'id' && typeof value === 'string') found.push(value)
        else walk(value)
      }
      return
    }
  }
  walk(view)
  return found
}

describe('playerView', () => {
  // --- Who it is for ------------------------------------------------------

  it('refuses to draw a screen for a player who is not at the table', () => {
    expect(() => playerView(dealt(), 'mallory')).toThrow(/not seated/)
  })

  // --- Your own hand ------------------------------------------------------

  it('names your own hand, whole', () => {
    const game = dealt()
    const view = playerView(game, 'alice')

    expect(view.hand).toHaveLength(defaultGameConfig.startingHandSize)
    // Whole printed records, not ids: a screen needs the name and the art.
    for (const card of view.hand) {
      expect(card.name).toEqual(expect.any(String))
      expect(card.image).toEqual(expect.any(String))
      expect(Object.values(CardType)).toContain(card.type)
    }
  })

  it('gives an opponent a COUNT of your hand and nothing more', () => {
    const game = dealt()
    const alice = playerView(game, 'alice')
    const bob = playerView(game, 'bob')

    const aliceSeat = bob.seats.find((s) => s.playerId === 'alice')!
    expect(aliceSeat.handCount).toBe(alice.hand.length)

    const aliceHandIds = alice.hand.map((c) => c.id)
    for (const id of aliceHandIds) {
      expect(everySeenId(bob)).not.toContain(id)
    }
  })

  it('shows every seat the same public board', () => {
    const game = dealt()
    const alice = playerView(game, 'alice')
    const bob = playerView(game, 'bob')

    expect(bob.monsterRow).toEqual(alice.monsterRow)
    expect(bob.parties).toEqual(alice.parties)
    expect(bob.mainDeck).toEqual(alice.mainDeck)
    expect(bob.currentPlayerId).toBe(alice.currentPlayerId)
  })

  // --- Face-down zones ----------------------------------------------------

  it('counts the face-down decks instead of naming them', () => {
    const game = dealt()
    const view = playerView(game, 'alice')

    expect(view.mainDeck.count).toBeGreaterThan(0)
    expect(view.monsterDeck.count).toBeGreaterThan(0)
    // Both are `{ count }` and nothing else — no card ever rides along.
    expect(Object.keys(view.mainDeck)).toEqual(['count'])
    expect(Object.keys(view.monsterDeck)).toEqual(['count'])
  })

  it('never names a card still in a deck', () => {
    const game = dealt()
    const deckIds = new Set<string>()
    // Drawing is the only way to learn a deck id, so compare against what the
    // deal left behind: every id in the pool that is in nobody's zone.
    const view = playerView(game, 'alice')
    const seen = new Set(everySeenId(view))
    const inZones = new Set([
      ...SEATS.flatMap((id) => game.gameState.getPlayer(id)!.getHand()),
      ...SEATS.map((id) => game.gameState.getParty(id).getLeaderId()),
      ...game.gameState.getMonsterPile().getAll(),
    ])
    for (const id of seen) {
      if (!inZones.has(id)) deckIds.add(id)
    }
    expect([...deckIds]).toEqual([])
  })

  // --- The face-up table --------------------------------------------------

  it('names the monster row and the leaders, for everyone', () => {
    const game = dealt()
    const view = playerView(game, 'bob')

    expect(view.monsterRow).toHaveLength(3)
    expect(view.parties).toHaveLength(SEATS.length)
    for (const party of view.parties) {
      expect(party.leader.type).toBe(CardType.Leader)
    }
  })

  it('shows a seat what is revealed to it, and nothing to the others', () => {
    const game = dealt()
    const [alice, bob] = game.playerOrder
    const [aCard] = game.gameState.getPlayer(alice)!.getHand()
    game.gameState.revealTo(bob, [aCard])

    expect(playerView(game, bob).revealedCards.map((c) => c.id)).toEqual([aCard])
    expect(playerView(game, alice).revealedCards).toEqual([])
  })

  // The strip captions itself, and only the engine knows whose look it is.
  it('names whose look a reveal is, and drops the caption when it ends', () => {
    const game = dealt()
    const [alice, bob] = game.playerOrder
    const [aCard] = game.gameState.getPlayer(alice)!.getHand()

    // a LOOK at a hand: the cards belong to alice, bob's ability is showing them
    game.gameState.revealTo(bob, [aCard], { byPlayerId: bob, ofPlayerId: alice })
    expect(playerView(game, bob)).toMatchObject({
      revealedBy: bob,
      revealedOf: alice,
    })

    // a revealed DRAW names only who revealed it
    game.gameState.hideRevealed(bob, [aCard])
    game.gameState.revealTo(bob, [aCard], { byPlayerId: bob })
    const shown = playerView(game, bob)
    expect(shown.revealedBy).toBe(bob)
    expect(shown.revealedOf).toBeUndefined()

    game.gameState.hideRevealed(bob, [aCard])
    expect(playerView(game, bob).revealedBy).toBeUndefined()
  })

  it('starts every party empty, with its leader ready', () => {
    const view = playerView(dealt(), 'alice')

    for (const party of view.parties) {
      expect(party.heroes).toEqual([])
      expect(party.monsters).toEqual([])
      expect(party.instanceCards).toEqual([])
      // ready = activatable at all (the Shadow Claw) and unspent; a passive
      // leader is never ready, whoever drew it
      expect(party.canRollOnLeader).toBe(isActivatable(party.leader.id))
    }
    expect(view.discardPile).toEqual([])
  })

  // --- The turn -----------------------------------------------------------

  it('reports the turn, the phase and each seat’s budget', () => {
    const game = dealt()
    startGame(game)
    const view = playerView(game, 'alice')

    expect(view.currentPlayerId).toBe(game.playerOrder[0])
    expect(view.phase).toBe(GamePhase.Turns)
    expect(view.seats.map((s) => s.playerId)).toEqual(game.playerOrder)
    expect(view.seats.find((s) => s.isCurrentTurn)!.playerId).toBe(
      game.playerOrder[0],
    )
    expect(view.seats[0].actionPoints).toBe(
      defaultGameConfig.actionPointsPerTurn,
    )
  })

  it('follows the board as an action changes it', () => {
    const game = dealt()
    startGame(game)
    const playerId = game.playerOrder[0]
    const before = playerView(game, playerId)

    game.turnManager.enqueue(new DrawCardAction('a1', playerId, game.emitter))
    const after = playerView(game, playerId)

    expect(after.hand).toHaveLength(before.hand.length + 1)
    expect(after.mainDeck.count).toBe(before.mainDeck.count - 1)
    expect(after.seats[0].actionPoints).toBe(before.seats[0].actionPoints - 1)
  })

  // --- What the engine answers, so the client cannot ----------------------

  it('offers no monster to a party with no heroes', () => {
    const game = dealt()
    startGame(game)
    const view = playerView(game, game.playerOrder[0])

    // Nobody has played a hero. The party LEADER is a card of a class, but it
    // is not one of the heroes a monster asks for (GameState.getHeroClasses),
    // so only a monster that asks for nothing at all could be on offer.
    for (const monster of view.monsterRow) {
      if (!('partyReq' in monster)) continue
      expect({
        id: monster.id,
        offered: view.attackableMonsterIds.includes(monster.id),
      }).toEqual({ id: monster.id, offered: monster.partyReq.classes.length === 0 })
    }
  })

  // --- Windows ------------------------------------------------------------

  it('tells the whole table a window is open, and only its owner what to pick', async () => {
    const game = dealtFrom(CardType.Hero)
    startGame(game)
    const playerId = game.playerOrder[0]
    const other = game.playerOrder[1]

    const heroId = playerView(game, playerId).hand[0].id

    game.turnManager.enqueue(
      new PlayHeroAction('a1', playerId, heroId, game.reactionManager, game.emitter),
    )

    const mine = playerView(game, playerId)
    const theirs = playerView(game, other)

    const challenge = mine.pendingWindows.find(
      (w) => w.type === ReactionWindowType.Challenge,
    )!
    expect(challenge).toBeDefined()
    expect(challenge.cardId).toBe(heroId)
    expect(challenge.isYours).toBe(true)
    // A challenge is the table's business: everyone sees who defends what,
    // and when the window lapses.
    expect(challenge.detail).toMatchObject({
      defenderId: playerId,
      cardId: heroId,
      challengeable: true,
      challenged: false,
    })
    expect(challenge.deadline).toBeGreaterThan(Date.now() - 1000)
    expect(
      theirs.pendingWindows.find((w) => w.windowId === challenge.windowId)!
        .detail,
    ).toEqual(challenge.detail)
    // The same window, seen from the other side of the table.
    expect(theirs.pendingWindows).toHaveLength(mine.pendingWindows.length)
    expect(
      theirs.pendingWindows.find((w) => w.windowId === challenge.windowId)!
        .isYours,
    ).toBe(false)
    expect(mine.busy).toBe(true)

    // Let it lapse rather than leaving a timer behind.
    await new Promise((done) => setTimeout(done, 200))
  })

  it('withholds the options of a window that is not yours', async () => {
    const game = dealt()
    startGame(game)
    const playerId = game.playerOrder[0]

    // A frame with a choice window on ONE player; the others may see that it
    // is open and must not see what it offers.
    const frameId = game.reactionManager.openFrame()
    game.reactionManager.openWindow(
      frameId,
      ReactionWindowType.CardChoice,
      playerId,
      { options: ['secret-card-1', 'secret-card-2'] },
    )

    const mine = playerView(game, playerId)
    const theirs = playerView(game, game.playerOrder[1])

    expect(mine.pendingWindows[0].options).toEqual([
      'secret-card-1',
      'secret-card-2',
    ])
    expect(theirs.pendingWindows[0].options).toBeUndefined()
    expect(theirs.pendingWindows[0].respondentId).toBe(playerId)

    await new Promise((done) => setTimeout(done, 200))
  })

  it('shows the whole table a roll as it stands, and when it lapses', async () => {
    const game = dealtQuiet()
    startGame(game)
    const playerId = game.playerOrder[0]
    const before = Date.now()

    const frameId = game.reactionManager.openFrame()
    game.reactionManager.openWindow(frameId, ReactionWindowType.Modifier, playerId, {
      rollerId: playerId,
      baseRoll: 8,
      rollReq: 10,
      heroId: 'hero-028', // Wise Shield — a dealt card (the pool is the registry)
    })

    const mine = playerView(game, playerId)
    const theirs = playerView(game, game.playerOrder[1])

    // Deciding whether to spend a modifier on somebody's roll needs the
    // number, so the roll is not the roller's secret.
    for (const view of [mine, theirs]) {
      const roll = view.pendingWindows[0]
      expect(roll.detail).toMatchObject({
        rollerId: playerId,
        baseRoll: 8,
        finalRoll: 8,
        rollReq: 10,
        heroId: 'hero-028', // Wise Shield — a dealt card (the pool is the registry)
        bonuses: [],
      })
      expect(roll.deadline).toBeGreaterThanOrEqual(before)
      expect(roll.deadline).toBeLessThanOrEqual(
        Date.now() + TEST_CONFIG.timeControl.reactionCountdownMs,
      )
    }

    await new Promise((done) => setTimeout(done, 200))
  })

  it("keeps a choice's question to its respondent", async () => {
    const game = dealt()
    startGame(game)
    const playerId = game.playerOrder[0]

    // A confirm carries the slot its continuation needs — which can name a
    // card only the respondent may know about.
    const frameId = game.reactionManager.openFrame()
    game.reactionManager.openWindow(frameId, ReactionWindowType.TaskChoice, playerId, {
      confirms: 'PlayIt',
      sourceCardId: 'hero-040',
      ctxSeed: { drawn: ['secret-card-9'] },
    })

    const mine = playerView(game, playerId)
    const theirs = playerView(game, game.playerOrder[1])

    expect(mine.pendingWindows[0].detail).toMatchObject({ confirms: 'PlayIt' })
    expect(theirs.pendingWindows[0].detail).toBeUndefined()
    expect(theirs.pendingWindows[0].deadline).toBe(mine.pendingWindows[0].deadline)

    await new Promise((done) => setTimeout(done, 200))
  })

  // --- Effects ------------------------------------------------------------

  it('shows a standing effect on the seat that carries it', () => {
    const game = dealt()
    game.gameState.addEffect({
      id: 'e1',
      sourceCardId: 'hero-028',
      ownerId: 'alice',
      type: PassiveType.RollBonus,
      value: 3,
    })

    const seat = (viewerId: string) =>
      playerView(game, viewerId).seats.find((s) => s.playerId === 'alice')!

    // Public: the table has to be able to see a +3 before deciding to modify.
    for (const viewer of SEATS) {
      expect(seat(viewer).effects).toEqual([
        {
          id: 'e1',
          sourceCardId: 'hero-028',
          type: PassiveType.RollBonus,
          value: 3,
          cardId: undefined,
          rollContext: undefined,
          cardTypes: undefined,
        },
      ])
    }
  })

  // --- The turn clock -----------------------------------------------------

  describe('the turn clock', () => {
    const CLOCKED: GameConfig = {
      ...TEST_CONFIG,
      timeControl: { ...TEST_CONFIG.timeControl, turnTimeMs: 30_000 },
    }
    const clocked = () => createGame(SEATS, { config: CLOCKED })

    it('is absent on a table played without one', () => {
      const game = dealt()
      startGame(game)

      expect(playerView(game, 'alice').turnClock).toBeUndefined()
    })

    it('names the turn’s deadline, and every seat reads the same clock', () => {
      const game = clocked()
      startGame(game)

      const clocks = SEATS.map((viewer) => playerView(game, viewer).turnClock!)
      for (const clock of clocks) {
        expect(clock.turnTimeMs).toBe(30_000)
        expect(clock.heldMs).toBeUndefined()
        expect(clock.deadline).toBeGreaterThan(Date.now())
        expect(clock.deadline).toBeLessThanOrEqual(Date.now() + 30_000)
      }
      // One clock for the table: every seat is told the same instant, and it
      // does not move between snapshots of one turn.
      expect(new Set(clocks.map((clock) => clock.deadline)).size).toBe(1)
      expect(playerView(game, 'alice').turnClock).toEqual(clocks[0])
      game.turnManager.stopClock()
    })

    // The clock itself pauses and resumes in turn-manager.spec.ts; what the
    // view owes the screen is the frozen state, so a board can draw a still
    // clock rather than lose it under someone else's window.
    it('reads as held while a reaction window is open — anyone’s', () => {
      const game = clocked()
      startGame(game)
      const running = playerView(game, 'alice').turnClock!
      game.reactionManager.openWindow(
        game.reactionManager.openFrame(),
        ReactionWindowType.CardChoice,
        game.playerOrder[1],
        { options: ['card-1', 'card-2'] },
      )

      const held = playerView(game, 'alice').turnClock!
      expect(running.deadline).toBeDefined()
      expect(held.deadline).toBeUndefined()
      expect(held.heldMs).toBeGreaterThan(0)
      expect(held.heldMs).toBeLessThanOrEqual(30_000)
      game.turnManager.stopClock()
    })
  })

  // --- Serialisable -------------------------------------------------------

  it('survives a round trip through JSON', () => {
    const game = dealt()
    startGame(game)
    const view = playerView(game, 'alice')

    expect(JSON.parse(JSON.stringify(view))).toEqual(
      JSON.parse(JSON.stringify(view)),
    )
    // Nothing live in it: no card object, no window, no GameState.
    expect(JSON.stringify(view)).not.toContain('[Function')
  })
})
