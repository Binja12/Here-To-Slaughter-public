import {
  ActionType,
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  TriggerScope,
} from 'shared'
import { RollOnHeroAction } from './roll-on-hero-action'
import { GameState } from '../game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { ReactionManager } from '../reactions/reaction-manager'
import { HeroCard } from '../cards/hero-card'
import { ModifierCard } from '../cards/modifier-card'
import { AbilityProcessor } from '../ability-processor'
import { PlayModifierReaction } from '../reactions/play-modifier-reaction'

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
    jest.useFakeTimers()
    emitter = new GameEventEmitter()
    gs = makeGs()
    player = makePlayer('p1', 3)
    party = makeParty('p1', ['hero-1'])
    gs.registerPlayer(player)
    gs.registerParty(party)
    gs.registerCard(makeHeroCard('hero-1'))
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  const makeAction = () => {
    const rm = new ReactionManager(gs, emitter)
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
      const rm = new ReactionManager(emptyGs, emitter)
      const action = new RollOnHeroAction('a1', 'p1', 'hero-1', emitter, rm)
      expect(action.canExecute(emptyGs)).toBe(false)
    })

    it('returns false when player has 0 action points', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', 0))
      gs2.registerParty(makeParty('p1', ['hero-1']))
      gs2.registerCard(makeHeroCard('hero-1'))
      const rm = new ReactionManager(gs2, emitter)
      const action = new RollOnHeroAction('a1', 'p1', 'hero-1', emitter, rm)
      expect(action.canExecute(gs2)).toBe(false)
    })

    it('returns false when hero is not in the player party', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1'))
      gs2.registerParty(makeParty('p1', []))
      gs2.registerCard(makeHeroCard('hero-1'))
      const rm = new ReactionManager(gs2, emitter)
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
  //
  // Math.random mock guide:
  //   baseRoll = Math.ceil(Math.random() * 11) + 1  →  range [2, 12]
  //   mockReturnValue(0)    → ceil(0)  + 1 = 1  (miss for rollReq ≥ 2)
  //   mockReturnValue(0.99) → ceil(10.89) + 1 = 12 (hit for rollReq ≤ 12)
  //
  // RollSuccess and markAbilityUsed are deferred until the modifier window
  // closes (5 s timeout).  Use jest.runAllTimers() to advance fake timers.

  describe('execute', () => {
    it('decreases player action points by 1 regardless of roll outcome', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)
      makeAction().execute(gs)
      expect(player.getActionPoints()).toBe(2)
    })

    it('emits DiceRolled immediately on every roll', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)
      const emitted: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => emitted.push(e) })
      makeAction().execute(gs)
      expect(emitted.some((e) => e.getType() === GameEventType.DiceRolled)).toBe(true)
    })

    it('does not emit RollSuccess when roll misses (after window closes)', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)
      const emitted: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => emitted.push(e) })
      makeAction().execute(gs)
      jest.runAllTimers()
      expect(emitted.some((e) => e.getType() === GameEventType.RollSuccess)).toBe(false)
    })

    it('marks ability used immediately before opening the frame, regardless of outcome', () => {
      // markAbilityUsed is called before openFrame so rollback cannot undo it
      jest.spyOn(Math, 'random').mockReturnValue(0)
      makeAction().execute(gs)
      expect(gs.getAbilitiesUsedThisTurn()).toContain('hero-1') // marked before timer runs
      jest.runAllTimers() // window closes with a fail — ability still marked
      expect(gs.getAbilitiesUsedThisTurn()).toContain('hero-1')
    })

    it('emits RollSuccess when roll succeeds (after modifier window closes)', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.99)
      const emitted: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => emitted.push(e) })
      makeAction().execute(gs)
      jest.runAllTimers() // advance past the 5 s modifier window
      const event = emitted.find((e) => e.getType() === GameEventType.RollSuccess)
      expect(event).toBeDefined()
      expect((event!.getPayload() as { cardId: string }).cardId).toBe('hero-1')
    })

    it('fires hero ability tasks via AbilityProcessor when roll succeeds', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.99)
      const taskSpy = jest.fn()
      gs.registerCard(makeHeroCard('hero-1'))
      // Behaviour comes from the registry, keyed by card id.
      new AbilityProcessor(
        gs,
        emitter,
        new ReactionManager(gs, emitter),
        new Map([
          [
            'hero-1',
            {
              trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
              steps: [{ execute: () => taskSpy() }],
            },
          ],
        ]),
      )
      makeAction().execute(gs)
      jest.runAllTimers() // modifier window closes → RollSuccess → ability fires
      expect(taskSpy).toHaveBeenCalledTimes(1)
    })
  })

  // ---------------------------------------------------------------------------
  // Full flow: play hero → modifier window → 3 outcomes
  //
  // baseRoll = Math.ceil(Math.random() * 11) + 1   range [2, 12]
  // rollReq  = 7 (hero-1)
  //   random = 0    → ceil(0)    + 1 = 1   (always misses)
  //   random = 0.99 → ceil(10.89)+ 1 = 12  (always hits)
  // ---------------------------------------------------------------------------

  describe('full flow', () => {
    let rm: ReactionManager
    let emitted: IGameEvent[]

    // Setup hero with rollReq=7 and a modifier card in player hand
    beforeEach(() => {
      gs.registerCard(makeHeroCard('hero-1', 7))
      player.addToHand('mod-1') // outer beforeEach already registered player + party
      gs.registerCard(
        new ModifierCard({
          id: 'mod-1',
          name: 'Modifier',
          type: CardType.Modifier,
          image: '',
          description: '',
          set: '',
          // No ability: a modifier is played by a player REQUEST gated on an
          // open modifier frame (PlayModifierReaction.canExecute), never by a
          // passive trigger.
          values: [3],
        }),
      )
      rm = new ReactionManager(gs, emitter)
      emitted = []
      emitter.addListener({ onEvent: (e) => emitted.push(e) })
    })

    const roll = () => new RollOnHeroAction('a1', 'p1', 'hero-1', emitter, rm).execute(gs)
    const hasEvent = (t: GameEventType) => emitted.some((e) => e.getType() === t)

    // --- Outcome 1: modifier ignored, base roll succeeds ---

    it('ignored + base succeeds: emits RollSuccess and FrameResolved after timeout', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.99) // baseRoll = 12 >= 7
      roll()
      jest.runAllTimers()
      expect(hasEvent(GameEventType.RollSuccess)).toBe(true)
      expect(hasEvent(GameEventType.FrameResolved)).toBe(true)
    })

    it('ignored + base succeeds: frame released (no open frames)', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.99)
      roll()
      jest.runAllTimers()
      expect(gs.hasOpenFrames()).toBe(false)
    })

    it('ignored + base succeeds: ability marked used before frame opens', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.99)
      roll()
      expect(gs.getAbilitiesUsedThisTurn()).toContain('hero-1')
    })

    // --- Outcome 2: modifier ignored, base roll fails (timeout) ---

    it('ignored + base fails: no RollSuccess emitted', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0) // baseRoll = 1 < 7
      roll()
      jest.runAllTimers()
      expect(hasEvent(GameEventType.RollSuccess)).toBe(false)
    })

    it('ignored + base fails: FrameResolved still emitted', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)
      roll()
      jest.runAllTimers()
      expect(hasEvent(GameEventType.FrameResolved)).toBe(true)
    })

    it('ignored + base fails: ability remains marked used (rollback does not undo it)', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)
      roll()
      jest.runAllTimers()
      expect(gs.getAbilitiesUsedThisTurn()).toContain('hero-1')
    })

    it('ignored + base fails: no open frames after timeout', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)
      roll()
      jest.runAllTimers()
      expect(gs.hasOpenFrames()).toBe(false)
    })

    // --- Outcome 3: modifier applied, roll still fails ---

    it('modifier applied + still fails: no RollSuccess emitted', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0) // baseRoll=1, +3 mod → 4 < 7
      roll()
      rm.submitReaction(new PlayModifierReaction('r1', 'p1', 'mod-1', 3, 'p1'))
      jest.runAllTimers()
      expect(hasEvent(GameEventType.RollSuccess)).toBe(false)
    })

    it('modifier applied + still fails: modifier card removed from hand', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)
      roll()
      rm.submitReaction(new PlayModifierReaction('r1', 'p1', 'mod-1', 3, 'p1'))
      jest.runAllTimers()
      expect(gs.getPlayer('p1')!.getHand()).not.toContain('mod-1')
    })

    it('modifier applied + still fails: modifier card in discard pile', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)
      roll()
      rm.submitReaction(new PlayModifierReaction('r1', 'p1', 'mod-1', 3, 'p1'))
      jest.runAllTimers()
      expect(gs.getDiscardPile().getAll()).toContain('mod-1')
    })

    it('modifier applied + still fails: FrameResolved emitted', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)
      roll()
      rm.submitReaction(new PlayModifierReaction('r1', 'p1', 'mod-1', 3, 'p1'))
      jest.runAllTimers()
      expect(hasEvent(GameEventType.FrameResolved)).toBe(true)
    })

    // --- Outcome 4: modifier applied, roll succeeds ---

    it('modifier applied + succeeds: emits RollSuccess', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0) // baseRoll=1, +7 mod → 8 >= 7
      roll()
      rm.submitReaction(new PlayModifierReaction('r1', 'p1', 'mod-1', 7, 'p1'))
      jest.runAllTimers()
      expect(hasEvent(GameEventType.RollSuccess)).toBe(true)
    })

    it('modifier applied + succeeds: modifier card removed from hand', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)
      roll()
      rm.submitReaction(new PlayModifierReaction('r1', 'p1', 'mod-1', 7, 'p1'))
      jest.runAllTimers()
      expect(gs.getPlayer('p1')!.getHand()).not.toContain('mod-1')
    })

    it('modifier applied + succeeds: modifier card in discard pile', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)
      roll()
      rm.submitReaction(new PlayModifierReaction('r1', 'p1', 'mod-1', 7, 'p1'))
      jest.runAllTimers()
      expect(gs.getDiscardPile().getAll()).toContain('mod-1')
    })

    it('modifier applied + succeeds: FrameResolved emitted', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)
      roll()
      rm.submitReaction(new PlayModifierReaction('r1', 'p1', 'mod-1', 7, 'p1'))
      jest.runAllTimers()
      expect(hasEvent(GameEventType.FrameResolved)).toBe(true)
    })

    it('modifier applied + succeeds: no open frames after resolve', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)
      roll()
      rm.submitReaction(new PlayModifierReaction('r1', 'p1', 'mod-1', 7, 'p1'))
      jest.runAllTimers()
      expect(gs.hasOpenFrames()).toBe(false)
    })
  })
})
