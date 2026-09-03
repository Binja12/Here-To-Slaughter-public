import {
  CardType,
  GameEventType,
  IGameEvent,
  PassiveType,
  WinConditionType,
} from 'shared'
import { createGame, startGame } from './create-game'
import { defaultGameConfig } from '../config/game-config'
import { baseGameCards } from '../../data/base-game-cards'
import { HeroCard } from '../cards/hero-card'
import { MonsterCard } from '../cards/monster-card'
import { PartyLeaderCard } from '../cards/party-leader-card'
import { GameState } from '../pipelines/game-state'
import { dealable } from '../repositories/ability-repository'

// ---------------------------------------------------------------------------
// createGame — the deal, and the wiring order that nothing else checks.
//
// Deliberately built against the REAL card data: the point of this seam is to
// turn 136 printed records into a table, so a stub pool would test the parts
// that were never in question.
// ---------------------------------------------------------------------------

const SEATS = ['alice', 'bob', 'carol']

const collect = (game: ReturnType<typeof createGame>) => {
  const events: IGameEvent[] = []
  game.emitter.addListener({ onEvent: (e) => events.push(e) })
  return events
}

const inPlay = (gs: GameState, playerId: string) => gs.getParty(playerId)

describe('createGame', () => {
  afterEach(() => jest.restoreAllMocks())

  // --- Seating ------------------------------------------------------------

  describe('seats', () => {
    it('refuses fewer players than the config allows', () => {
      expect(() => createGame(['solo'])).toThrow(/seats 2 to 4/)
    })

    it('refuses more players than the config allows', () => {
      expect(() => createGame(['a', 'b', 'c', 'd', 'e'])).toThrow(/seats 2 to 4/)
    })

    it('refuses the same player twice', () => {
      expect(() => createGame(['a', 'a'])).toThrow(/seated twice/)
    })

    it('seats everybody who was passed in', () => {
      const game = createGame(SEATS)
      expect(game.playerOrder.slice().sort()).toEqual(
        SEATS.slice().sort(),
      )
      for (const id of SEATS) expect(game.gameState.getPlayer(id)).toBeDefined()
    })

    it('randomises the order, so joining order carries no advantage', () => {
      // Reverse the shuffle's picks: a real permutation, not the input order.
      jest.spyOn(Math, 'random').mockReturnValue(0)
      const game = createGame(SEATS)
      expect(game.playerOrder).not.toEqual(SEATS)
      expect(game.playerOrder.slice().sort()).toEqual(SEATS.slice().sort())
    })
  })

  // --- The table ----------------------------------------------------------

  describe('the deal', () => {
    it('registers every dealable printed card as an object the engine can look up', () => {
      const game = createGame(SEATS)

      for (const data of baseGameCards.filter(dealable)) {
        expect(game.gameState.getCard(data.id)).toBeDefined()
      }
    })

    it('leaves a card the registry does not implement out of the deal — the pool is exactly the registry', () => {
      const game = createGame(SEATS)

      expect(game.gameState.getCard('hero-046')).toBeUndefined() // Dodgy Dealer: no entry yet
      expect(game.gameState.getCard('hero-028')).toBeDefined() // Wise Shield
    })

    it('builds the right CLASS for each card type', () => {
      const game = createGame(SEATS)
      const gs = game.gameState

      expect(gs.getCard('hero-028')).toBeInstanceOf(HeroCard)
      expect(gs.getCard('monster-123')).toBeInstanceOf(MonsterCard)
      expect(gs.getCard('leader-116')).toBeInstanceOf(PartyLeaderCard)
    })

    it('deals a starting hand to every player', () => {
      const game = createGame(SEATS)

      for (const id of SEATS) {
        expect(game.gameState.getPlayer(id)!.getHand()).toHaveLength(
          defaultGameConfig.startingHandSize,
        )
      }
    })

    it('deals every player a DIFFERENT hand', () => {
      const game = createGame(SEATS)
      const dealt = SEATS.flatMap((id) =>
        game.gameState.getPlayer(id)!.getHand(),
      )
      expect(new Set(dealt).size).toBe(dealt.length)
    })

    it('turns three monsters face up', () => {
      const game = createGame(SEATS)

      expect(game.gameState.getMonsterPile().getSize()).toBe(3)
      for (const id of game.gameState.getMonsterPile().getAll()) {
        expect(game.gameState.getCard(id)).toBeInstanceOf(MonsterCard)
      }
    })

    it('leaves the rest of the monsters face down behind the row', () => {
      const game = createGame(SEATS)
      const monsters = baseGameCards.filter(dealable).filter(
        (c) => c.type === CardType.Monster,
      ).length

      expect(game.gameState.getMonsterDeck().getSize()).toBe(monsters - 3)
    })

    it('gives every party a leader, and no two the same', () => {
      const game = createGame(SEATS)
      const leaderIds = SEATS.map((id) => inPlay(game.gameState, id).getLeaderId())

      expect(new Set(leaderIds).size).toBe(SEATS.length)
      for (const leaderId of leaderIds) {
        expect(game.gameState.getCard(leaderId)).toBeInstanceOf(PartyLeaderCard)
      }
    })

    it('starts every party empty apart from its leader', () => {
      const game = createGame(SEATS)

      for (const id of SEATS) {
        expect(inPlay(game.gameState, id).getHeroIds()).toEqual([])
        expect(inPlay(game.gameState, id).getMonsterIds()).toEqual([])
      }
    })

    it('starts the discard pile empty', () => {
      expect(createGame(SEATS).gameState.getDiscardPile().getSize()).toBe(0)
    })

    it('keeps leaders and monsters OUT of the main deck', () => {
      const game = createGame(SEATS)
      const dealt = SEATS.flatMap((id) =>
        game.gameState.getPlayer(id)!.getHand(),
      )

      for (const cardId of dealt) {
        const type = game.gameState.getCard(cardId)!.getType()
        expect(type).not.toBe(CardType.Leader)
        expect(type).not.toBe(CardType.Monster)
      }
    })

    it('accounts for every card that is IN the game', () => {
      const game = createGame(SEATS)
      const gs = game.gameState
      const inHands = SEATS.reduce(
        (n, id) => n + gs.getPlayer(id)!.getHand().length,
        0,
      )
      const total =
        gs.getMainDeck().getSize() +
        gs.getMonsterDeck().getSize() +
        gs.getMonsterPile().getSize() +
        inHands +
        SEATS.length // one leader each

      // Leaders are dealt one per seat, so the rest are printed cards this
      // game never uses. They stay registered — every id resolves — but they
      // sit in no zone and are scanned by nothing.
      const leaders = baseGameCards.filter(
        (c) => c.type === CardType.Leader,
      ).length
      expect(total).toBe(baseGameCards.filter(dealable).length - (leaders - SEATS.length))
    })

    it('leaves the undealt leaders in no zone at all', () => {
      const game = createGame(SEATS)
      const gs = game.gameState
      const seated = SEATS.map((id) => inPlay(gs, id).getLeaderId())
      const spare = baseGameCards
        .filter((c) => c.type === CardType.Leader)
        .map((c) => c.id)
        .filter((id) => !seated.includes(id))

      expect(spare).toHaveLength(3)
      for (const id of spare) {
        expect(gs.getCard(id)).toBeDefined() // still resolvable by id
        expect(gs.getCardOwner(id)).toBeUndefined() // but owned by nobody
      }
    })

    it('shuffles — two games do not deal the same top card', () => {
      const runs = new Set(
        Array.from({ length: 12 }, () =>
          createGame(SEATS).gameState.getPlayer(SEATS[0])!.getHand()[0],
        ),
      )
      expect(runs.size).toBeGreaterThan(1)
    })

    it('honours a config with a different hand size', () => {
      const game = createGame(SEATS, {
        config: { ...defaultGameConfig, startingHandSize: 2 },
      })

      for (const id of SEATS) {
        expect(game.gameState.getPlayer(id)!.getHand()).toHaveLength(2)
      }
    })

    it('gives each player the configured action points', () => {
      const game = createGame(SEATS, {
        config: { ...defaultGameConfig, actionPointsPerTurn: 7 },
      })

      expect(
        game.gameState.getPlayer(SEATS[0])!.getActionPointsPerTurn(),
      ).toBe(7)
    })

    it('drops cards outside the configured sets', () => {
      expect(() =>
        createGame(SEATS, {
          config: { ...defaultGameConfig, cardSets: ['expansion-that-is-not-here'] },
        }),
      ).toThrow(/leaders in the configured card sets/)
    })
  })

  // --- Starting -----------------------------------------------------------

  describe('startGame', () => {
    it('deals without starting — nothing is announced until asked', () => {
      const game = createGame(SEATS)
      const events = collect(game)

      expect(events).toEqual([])
      expect(game.turnManager.getActionPoints()).toBe(0)
    })

    it('announces GameStarted BEFORE the first turn', () => {
      const game = createGame(SEATS)
      const events = collect(game)

      startGame(game)

      const types = events.map((e) => e.getType())
      expect(types.indexOf(GameEventType.GameStarted)).toBeGreaterThanOrEqual(0)
      expect(types.indexOf(GameEventType.GameStarted)).toBeLessThan(
        types.indexOf(GameEventType.TurnStarted),
      )
    })

    it('opens the first turn for the first seat', () => {
      const game = createGame(SEATS)
      startGame(game)

      expect(game.gameState.getCurrentPlayerId()).toBe(game.playerOrder[0])
      expect(game.turnManager.getActionPoints()).toBe(
        defaultGameConfig.actionPointsPerTurn,
      )
    })

    // The two silent wiring bugs this file exists to catch: TaskManager must be
    // on the emitter BEFORE GameEngine, and leaders must be seated BEFORE
    // GameStarted. Get either wrong and a leader passive simply never installs,
    // with nothing thrown and nothing logged.
    //
    // The pool is narrowed to the three leaders that carry a passive, so all
    // three seats hold one and the assertion is not left to the shuffle.
    it('installs every leader passive on its own owner', () => {
      const passiveLeaders = ['leader-116', 'leader-118', 'leader-119']
      const game = createGame(SEATS, {
        cards: baseGameCards.filter(
          (c) => c.type !== CardType.Leader || passiveLeaders.includes(c.id),
        ),
      })

      startGame(game)

      for (const id of SEATS) {
        const leaderId = inPlay(game.gameState, id).getLeaderId()
        // getAllEffects, not getEffects: these are scoped to a RollContext,
        // and asking about no context deliberately leaves scoped ones out.
        const effects = game.gameState
          .getPlayer(id)!
          .getAllEffects()
          .filter((e) => e.type === PassiveType.RollBonus)

        expect(effects).toEqual([
          expect.objectContaining({ sourceCardId: leaderId, ownerId: id }),
        ])
      }
    })

    it('installs nothing before startGame is called', () => {
      const passiveLeaders = ['leader-116', 'leader-118', 'leader-119']
      const game = createGame(SEATS, {
        cards: baseGameCards.filter(
          (c) => c.type !== CardType.Leader || passiveLeaders.includes(c.id),
        ),
      })

      for (const id of SEATS) {
        expect(game.gameState.getPlayer(id)!.getAllEffects()).toEqual([])
      }
    })

    it('builds win conditions the engine can actually check', () => {
      const game = createGame(SEATS)
      startGame(game)

      // SlayMonsters(3): hand a player three monsters and end a turn.
      const winner = game.playerOrder[0]
      for (const monsterId of game.gameState.getMonsterPile().getAll()) {
        inPlay(game.gameState, winner).addMonster(monsterId)
      }
      const events = collect(game)
      game.turnManager.endTurn()

      const ended = events.find((e) => e.getType() === GameEventType.GameEnded)
      expect(ended!.getPayload()).toMatchObject({ winnerId: winner })
    })

    it('maps both configured win condition types without throwing', () => {
      expect(() =>
        createGame(SEATS, {
          config: {
            ...defaultGameConfig,
            winConditions: [
              { type: WinConditionType.SlayMonsters, value: 3 },
              { type: WinConditionType.PartyClasses, value: 6 },
            ],
          },
        }),
      ).not.toThrow()
    })
  })

  // --- Isolation ----------------------------------------------------------

  it('two games share no state', () => {
    const a = createGame(SEATS)
    const b = createGame(SEATS)

    startGame(a)

    expect(b.gameState.getCurrentPlayerId()).toBeUndefined()
    expect(a.gameState).not.toBe(b.gameState)
    expect(a.gameId).not.toBe(b.gameId)
    // Card OBJECTS are per game too: one game's board must not be reachable
    // from another's.
    expect(a.gameState.getCard('hero-028')).not.toBe(
      b.gameState.getCard('hero-028'),
    )
  })
})
