import { ActionType, CardType, HeroClass } from 'shared'
import { RollOnHeroAction } from './roll-on-hero-action'
import { GameState } from '../game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { ReactionManager } from '../reactions/reaction-manager'
import { HeroCard } from '../cards/hero-card'

// --- Helpers ---

const makePlayer = (id: string, ap = 3) =>
  new Player({ id, name: `Player ${id}`, hand: [], partyId: `party-${id}`, actionPoints: ap })

const makeParty = (playerId: string, heroIds: string[] = []) =>
  new Party({ playerId, leaderId: `leader-${playerId}`, heroIds, monsterIds: [] })

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
    ability: { trigger: [], steps: [] },
  })

const makeGs = () => {
  const deck = new CardStack('deck-1', 'main-deck')
  const discard = new CardPile('discard-1', 'discard-pile')
  return new GameState(deck, discard)
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

  describe('execute', () => {
    // Math.random mock guide for execute():
    //   baseRoll = Math.ceil(Math.random() * 11) + 1  →  range [2, 12]
    //   mockReturnValue(0)    → Math.ceil(0)  + 1 = 1  (miss for any rollReq >= 2)
    //   mockReturnValue(0.99) → Math.ceil(10.89) + 1 = 12 (hit for any rollReq <= 12)

    it('always decreases player action points by 1 regardless of roll', () => {
      // Force a miss so we don't hit the ctx bug in the success branch
      jest.spyOn(Math, 'random').mockReturnValue(0)
      makeAction().execute(gs)
      expect(player.getActionPoints()).toBe(2)
    })

    it('does not process ability when roll misses', () => {
      // rollReq = 10, baseRoll = 1 → miss, no ability processing → no error
      jest.spyOn(Math, 'random').mockReturnValue(0)
      expect(() => makeAction().execute(gs)).not.toThrow()
    })

    // NOTE: RollOnHeroAction.execute() references an undefined variable `ctx`
    // inside the roll-success branch. When the roll meets or exceeds the hero's
    // rollReq, AbilityProcessor.process() is called with an undeclared `ctx`,
    // causing a ReferenceError. Document this known bug and update once fixed.
    it('BUG: throws a ReferenceError when roll succeeds because ctx is not declared', () => {
      // rollReq = 10, baseRoll = 12 → success, ctx bug triggered
      jest.spyOn(Math, 'random').mockReturnValue(0.99)
      expect(() => makeAction().execute(gs)).toThrow(ReferenceError)
    })
  })
})
