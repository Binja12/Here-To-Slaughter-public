import { ActionType, CardType, GameEventType, IGameEvent, RollCompareMode } from 'shared'
import { AttackMonsterAction } from './attack-monster-action'
import { GameState } from '../game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { ReactionManager } from '../reactions/reaction-manager'
import { MonsterCard } from '../cards/monster-card'
import { AbilityProcessor } from '../ability-processor'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makePlayer = (id: string, ap = 3) =>
  new Player({ id, name: `Player ${id}`, hand: [], partyId: `party-${id}`, actionPoints: ap })

const makeParty = (playerId: string) =>
  new Party({ playerId, leaderId: `leader-${playerId}`, heroIds: [], monsterIds: [] })

/**
 * Roll formula: Math.floor(Math.random() * 11) + 1  → range [1, 11]
 *   random = 0    → 1   (FightBack: ≤ lowerReq=3)
 *   random = 0.3  → 4   (Miss: 4–7)
 *   random = 0.99 → 11  (Slay: ≥ higherReq=8)
 */
const makeMonsterCard = (id: string, higherReq = 8, lowerReq = 3) =>
  new MonsterCard({
    id,
    name: `Monster ${id}`,
    type: CardType.Monster,
    image: '',
    description: '',
    set: '',
    ability: { trigger: GameEventType.MonsterAttackFail, steps: [] },
    lowerReq,
    higherReq,
    rollCompareMode: RollCompareMode.HighToWin,
    partyReq: { classes: [] },
  })

const makeGs = () =>
  new GameState(
    new CardStack('deck-1', 'main-deck'),
    new CardPile('discard-1', 'discard-pile'),
    new CardStack('mdeck-1', 'monster-deck'),
    new CardPile('mpile-1', 'monster-pile'),
  )

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AttackMonsterAction', () => {
  let emitter: GameEventEmitter
  let events: IGameEvent[]
  let gs: GameState
  let player: Player
  let party: Party

  beforeEach(() => {
    jest.useFakeTimers()
    emitter = new GameEventEmitter()
    events = []
    emitter.addListener({ onEvent: (e) => events.push(e) })
    gs = makeGs()
    player = makePlayer('p1', 3)
    party = makeParty('p1')
    gs.registerPlayer(player)
    gs.registerParty(party)
    gs.setCurrentPlayerId('p1')
    gs.registerCard(makeMonsterCard('monster-1'))
    gs.getMonsterPile().add('monster-1')
    // AbilityProcessor listens on emitter to resume pipelines on FrameResolved
    new AbilityProcessor(gs, emitter, new ReactionManager(gs, emitter))
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  const makeAction = () =>
    new AttackMonsterAction('a1', 'p1', 'monster-1', new ReactionManager(gs, emitter))

  const hasEvent = (t: GameEventType) => events.some((e) => e.getType() === t)

  // --- Metadata ---

  describe('metadata', () => {
    it('getId returns the action id', () => {
      expect(makeAction().getId()).toBe('a1')
    })

    it('getType returns ActionType.AttackMonster', () => {
      expect(makeAction().getType()).toBe(ActionType.AttackMonster)
    })

    it('getPlayerId returns the player id', () => {
      expect(makeAction().getPlayerId()).toBe('p1')
    })

    it('getCost returns 2', () => {
      expect(makeAction().getCost()).toBe(2)
    })

    it('isReactable returns true', () => {
      expect(makeAction().isReactable()).toBe(true)
    })
  })

  // --- canExecute ---

  describe('canExecute', () => {
    it('returns false when player does not exist', () => {
      const emptyGs = makeGs()
      emptyGs.setCurrentPlayerId('p1')
      emptyGs.getMonsterPile().add('monster-1')
      const action = new AttackMonsterAction('a1', 'p1', 'monster-1', new ReactionManager(emptyGs, emitter))
      expect(action.canExecute(emptyGs)).toBe(false)
    })

    it('returns false when player is not the current player', () => {
      gs.setCurrentPlayerId('p2')
      expect(makeAction().canExecute(gs)).toBe(false)
    })

    it('returns false when player has fewer than 2 action points', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', 1))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      gs2.registerCard(makeMonsterCard('monster-1'))
      gs2.getMonsterPile().add('monster-1')
      expect(new AttackMonsterAction('a1', 'p1', 'monster-1', new ReactionManager(gs2, emitter)).canExecute(gs2)).toBe(false)
    })

    it('returns false when the monster is not in the monster pile', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', 3))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      gs2.registerCard(makeMonsterCard('monster-1'))
      expect(new AttackMonsterAction('a1', 'p1', 'monster-1', new ReactionManager(gs2, emitter)).canExecute(gs2)).toBe(false)
    })

    it('returns true when all conditions are met', () => {
      expect(makeAction().canExecute(gs)).toBe(true)
    })
  })

  // --- execute ---

  describe('execute', () => {
    it('decreases player action points by 2 immediately', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.3)
      makeAction().execute(gs)
      expect(player.getActionPoints()).toBe(1)
    })

    it('emits ModifierWindowOpened immediately', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.3)
      makeAction().execute(gs)
      expect(hasEvent(GameEventType.ModifierWindowOpened)).toBe(true)
    })

    it('opens a reaction frame (hasOpenFrames after execute)', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.3)
      makeAction().execute(gs)
      expect(gs.hasOpenFrames()).toBe(true)
    })

    // --- Slay (random=0.99 → roll=11 ≥ higherReq=8) ---

    describe('Slay outcome', () => {
      beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0.99))

      it('removes the monster from the pile after timeout', () => {
        makeAction().execute(gs)
        jest.runAllTimers()
        expect(gs.getMonsterPile().getAll()).not.toContain('monster-1')
      })

      it('adds the monster to the attacker party', () => {
        makeAction().execute(gs)
        jest.runAllTimers()
        expect(party.getMonsterIds()).toContain('monster-1')
      })

      it('draws a replacement from the monster deck to the pile', () => {
        gs.getMonsterDeck().addToBottom('monster-2')
        makeAction().execute(gs)
        jest.runAllTimers()
        expect(gs.getMonsterPile().getAll()).toContain('monster-2')
      })

      it('emits MonsterSlain', () => {
        makeAction().execute(gs)
        jest.runAllTimers()
        expect(hasEvent(GameEventType.MonsterSlain)).toBe(true)
      })

      it('emits FrameResolved', () => {
        makeAction().execute(gs)
        jest.runAllTimers()
        expect(hasEvent(GameEventType.FrameResolved)).toBe(true)
      })

      it('no open frames after resolve', () => {
        makeAction().execute(gs)
        jest.runAllTimers()
        expect(gs.hasOpenFrames()).toBe(false)
      })
    })

    // --- Miss (random=0.3 → roll=4, between lowerReq=3 and higherReq=8) ---

    describe('Miss outcome', () => {
      beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0.3))

      it('monster stays in pile', () => {
        makeAction().execute(gs)
        jest.runAllTimers()
        expect(gs.getMonsterPile().getAll()).toContain('monster-1')
      })

      it('monster not added to party', () => {
        makeAction().execute(gs)
        jest.runAllTimers()
        expect(party.getMonsterIds()).not.toContain('monster-1')
      })

      it('does not emit MonsterSlain or MonsterAttackFail', () => {
        makeAction().execute(gs)
        jest.runAllTimers()
        expect(hasEvent(GameEventType.MonsterSlain)).toBe(false)
        expect(hasEvent(GameEventType.MonsterAttackFail)).toBe(false)
      })

      it('emits FrameResolved', () => {
        makeAction().execute(gs)
        jest.runAllTimers()
        expect(hasEvent(GameEventType.FrameResolved)).toBe(true)
      })
    })

    // --- FightBack (random=0 → roll=1 ≤ lowerReq=3) ---

    describe('FightBack outcome', () => {
      beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0))

      it('monster stays in pile', () => {
        makeAction().execute(gs)
        jest.runAllTimers()
        expect(gs.getMonsterPile().getAll()).toContain('monster-1')
      })

      it('monster not added to party', () => {
        makeAction().execute(gs)
        jest.runAllTimers()
        expect(party.getMonsterIds()).not.toContain('monster-1')
      })

      it('emits MonsterAttackFail', () => {
        makeAction().execute(gs)
        jest.runAllTimers()
        expect(hasEvent(GameEventType.MonsterAttackFail)).toBe(true)
      })

      it('emits FrameResolved', () => {
        makeAction().execute(gs)
        jest.runAllTimers()
        expect(hasEvent(GameEventType.FrameResolved)).toBe(true)
      })
    })
  })
})
