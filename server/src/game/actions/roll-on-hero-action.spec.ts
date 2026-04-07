import { ActionType, CardType, GameEventType, HeroClass, IGameEvent } from 'shared'
import { RollOnHeroAction } from './roll-on-hero-action'
import { GameState } from '../game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { ReactionManager } from '../reactions/reaction-manager'
import { HeroCard } from '../cards/hero-card'
import { AbilityProcessor } from '../ability-processor'

// --- Helpers ---

const makePlayer = (id: string, ap = 3) =>
  new Player({
    id,
    name: `Player ${id}`,
    hand: [],
    partyId: `party-${id}`,
    actionPoints: ap,
  })

const makeParty = (playerId: string, heroIds: string[] = []) =>
  new Party({
    playerId,
    leaderId: `leader-${playerId}`,
    heroIds,
    monsterIds: [],
  })

/** rollReq defaults to 10 so we can easily control hit/miss with Math.random mock. */
const makeHeroCard = (id: string, rollReq = 10) =>
  new HeroCard({
    id,
    name: `Hero ${id}`,
    type: CardType.Hero,
    image: '',
    description: '',
    heroClass: HeroClass.Wizard,
    rollReq,
    set: '',
    ability: { trigger: GameEventType.DiceRolled },
  })

const makeGs = () => {
  const deck = new CardStack('deck-1', 'main-deck')
  const discardPile = new CardPile('discard pile', 'discard pile')
  const monsterDeck = new CardStack('monster deck', 'main monster deck')
  const monsterPile = new CardPile('slayable monsters', 'monster pile')
  return new GameState(deck, discardPile, monsterDeck, monsterPile)
}

// --- Tests ---

describe('RollOnHeroAction', () => {
  let emitter: GameEventEmitter
  let gs: GameState
  let player: Player
  let party: Party

  beforeEach(() => {
    emitter = new GameEventEmitter()
    gs = makeGs()
    player = makePlayer('p1', 3)
    party = makeParty('p1', ['hero-1'])
    gs.registerPlayer(player)
    gs.registerParty(party)
    gs.registerCard(makeHeroCard('hero-1'))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  const makeAction = () => {
    const rm = new ReactionManager(gs, emitter, () => {})
    return new RollOnHeroAction('a1', 'p1', 'hero-1', emitter, rm)
  }

  // --- Metadata ---

  describe('metadata', () => {
    it('getId returns the action id', () => {
      expect(makeAction().getId()).toBe('a1')
    })

    it('getType returns ActionType.RollOnHero', () => {
      expect(makeAction().getType()).toBe(ActionType.RollOnHero)
    })

    it('getPlayerId returns the player id', () => {
      expect(makeAction().getPlayerId()).toBe('p1')
    })

    it('getCost returns 1', () => {
      expect(makeAction().getCost()).toBe(1)
    })
  })

  // --- canExecute ---

  describe('canExecute', () => {
    it('returns false when player does not exist', () => {
      const emptyGs = makeGs()
      emptyGs.registerParty(makeParty('p1', ['hero-1']))
      const rm = new ReactionManager(emptyGs, emitter, () => {})
      const action = new RollOnHeroAction('a1', 'p1', 'hero-1', emitter, rm)
      expect(action.canExecute(emptyGs)).toBe(false)
    })

    it('returns false when player has 0 action points', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', 0))
      gs2.registerParty(makeParty('p1', ['hero-1']))
      gs2.registerCard(makeHeroCard('hero-1'))
      const rm = new ReactionManager(gs2, emitter, () => {})
      const action = new RollOnHeroAction('a1', 'p1', 'hero-1', emitter, rm)
      expect(action.canExecute(gs2)).toBe(false)
    })

    it('returns false when hero is not in the player party', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1'))
      gs2.registerParty(makeParty('p1', []))
      gs2.registerCard(makeHeroCard('hero-1'))
      const rm = new ReactionManager(gs2, emitter, () => {})
      const action = new RollOnHeroAction('a1', 'p1', 'hero-1', emitter, rm)
      expect(action.canExecute(gs2)).toBe(false)
    })

    it('returns false when ability has already been used this turn', () => {
      gs.markAbilityUsed('hero-1')
      expect(makeAction().canExecute(gs)).toBe(false)
    })

    it('returns true when all conditions are met', () => {
      expect(makeAction().canExecute(gs)).toBe(true)
    })
  })

  // --- execute ---

  // Math.random mock guide for execute():
  //   baseRoll = Math.ceil(Math.random() * 11) + 1  →  range [2, 12]
  //   mockReturnValue(0)    → Math.ceil(0)  + 1 = 1  (miss for rollReq >= 2)
  //   mockReturnValue(0.99) → Math.ceil(10.89) + 1 = 12 (hit for rollReq <= 12)

  describe('execute', () => {
    it('decreases player action points by 1 regardless of roll outcome', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)
      makeAction().execute(gs)
      expect(player.getActionPoints()).toBe(2)
    })

    it('emits DiceRolled on every roll', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)
      const emitted: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => emitted.push(e) })
      makeAction().execute(gs)
      expect(emitted.some((e) => e.getType() === GameEventType.DiceRolled)).toBe(true)
    })

    it('does not emit RollSuccess when roll misses', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)
      const emitted: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => emitted.push(e) })
      makeAction().execute(gs)
      expect(emitted.some((e) => e.getType() === GameEventType.RollSuccess)).toBe(false)
    })

    it('does not mark ability used when roll misses', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)
      makeAction().execute(gs)
      expect(gs.getAbilitiesUsedThisTurn()).not.toContain('hero-1')
    })

    it('emits RollSuccess when roll succeeds', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.99)
      const emitted: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => emitted.push(e) })
      makeAction().execute(gs)
      const event = emitted.find((e) => e.getType() === GameEventType.RollSuccess)
      expect(event).toBeDefined()
      expect((event!.getPayload() as { cardId: string }).cardId).toBe('hero-1')
    })

    it('marks ability used when roll succeeds', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.99)
      makeAction().execute(gs)
      expect(gs.getAbilitiesUsedThisTurn()).toContain('hero-1')
    })

    it('fires hero ability tasks via AbilityProcessor when roll succeeds', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.99)
      const taskSpy = jest.fn()
      gs.registerCard(
        new HeroCard({
          id: 'hero-1',
          name: 'Hero hero-1',
          type: CardType.Hero,
          image: '',
          description: '',
          set: '',
          heroClass: HeroClass.Wizard,
          rollReq: 10,
          ability: {
            trigger: GameEventType.RollSuccess,
            steps: [{ execute: (_gs, _ctx, _em) => taskSpy() }],
          } as any,
        }),
      )
      new AbilityProcessor(gs, emitter)
      makeAction().execute(gs)
      expect(taskSpy).toHaveBeenCalledTimes(1)
    })
  })
})
