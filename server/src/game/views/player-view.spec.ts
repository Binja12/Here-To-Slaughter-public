import {
  CardType,
  GameConfig,
  PassiveType,
  ReactionWindowType,
  TurnPhase,
} from 'shared'
import { defaultGameConfig } from '../config/game-config'
import { baseGameCards } from '../../data/base-game-cards'
import { createGame, startGame, Game } from '../setup/create-game'
import { playerView } from './player-view'
import { DrawCardAction } from '../actions/draw-card-action'
import { PlayHeroAction } from '../actions/play-hero-action'

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

  it('starts every party empty, with its leader ready', () => {
    const view = playerView(dealt(), 'alice')

    for (const party of view.parties) {
      expect(party.heroes).toEqual([])
      expect(party.monsters).toEqual([])
      expect(party.instanceCards).toEqual([])
      expect(party.canRollOnLeader).toBe(true)
    }
    expect(view.discardPile).toEqual([])
  })

  // --- The turn -----------------------------------------------------------

  it('reports the turn, the phase and each seat’s budget', () => {
    const game = dealt()
    startGame(game)
    const view = playerView(game, 'alice')

    expect(view.currentPlayerId).toBe(game.playerOrder[0])
    expect(view.turnPhase).toBe(TurnPhase.ActionWindow)
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

  it('offers no monster to a party that cannot field one', () => {
    const game = dealt()
    startGame(game)
    const view = playerView(game, game.playerOrder[0])

    // Every printed monster asks for at least one hero; nobody has played one.
    const needy = view.monsterRow.filter(
      (m) => 'partyReq' in m && m.partyReq.classes.length > 0,
    )
    for (const monster of needy) {
      expect(view.attackableMonsterIds).not.toContain(monster.id)
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
