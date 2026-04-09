import { ActionType, CardType, RollCompareMode } from 'shared'
import { AttackMonsterAction } from './attack-monster-action'
import { GameState } from '../game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { ReactionManager } from '../reactions/reaction-manager'
import { MonsterCard } from '../cards/monster-card'

// --- Helpers ---

const makePlayer = (id: string, ap = 3) =>
  new Player({ id, name: `Player ${id}`, hand: [], partyId: `party-${id}`, actionPoints: ap })

const makeParty = (playerId: string) =>
  new Party({ playerId, leaderId: `leader-${playerId}`, heroIds: [], monsterIds: [] })

/**
 * HighToWin defaults: higherReq=8, lowerReq=3
 *   roll >= 8  → Slay       (mock Math.random to 0.99 → roll 12)
 *   roll <= 3  → FightBack  (mock Math.random to 0    → roll 1)
 *   4–7        → Miss       (mock Math.random to 0.3  → roll 5)
 */
const makeMonsterCard = (id: string, higherReq = 8, lowerReq = 3) =>
  new MonsterCard({
    id,
    name: `Monster ${id}`,
    type: CardType.Monster,
    image: '',
    description: '',
    set: '',
    ability: { trigger: [], steps: [] },
    lowerReq,
    higherReq,
    rollCompareMode: RollCompareMode.HighToWin,
    partyReq: { classes: [] },
  })

const makeGs = () => {
  const deck = new CardStack('deck-1', 'main-deck')
  const discard = new CardPile('discard-1', 'discard-pile')
  const monsterDeck = new CardStack('mdeck-1', 'monster-deck')
  const monsterPile = new CardPile('mpile-1', 'monster-pile')
  return new GameState(deck, discard, monsterDeck, monsterPile)
}

// --- Tests ---

describe('AttackMonsterAction', () => {
  let emitter: GameEventEmitter
  let emitSpy: jest.SpyInstance
  let gs: GameState
  let player: Player
  let party: Party

  beforeEach(() => {
    emitter = new GameEventEmitter()
    emitSpy = jest.spyOn(emitter, 'emit')
    gs = makeGs()
    player = makePlayer('p1', 3)
    party = makeParty('p1')
    gs.registerPlayer(player)
    gs.registerParty(party)
    gs.setCurrentPlayerId('p1')
    gs.registerCard(makeMonsterCard('monster-1'))
    gs.getMonsterPile().add('monster-1')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  const makeAction = () => {
    const rm = new ReactionManager(gs, emitter)
    return new AttackMonsterAction('a1', 'p1', 'monster-1', rm, emitter)
  }

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
  })

  // --- canExecute ---

  describe('canExecute', () => {
    it('returns false when player does not exist', () => {
      const emptyGs = makeGs()
      emptyGs.setCurrentPlayerId('p1')
      emptyGs.getMonsterPile().add('monster-1')
      const rm = new ReactionManager(emptyGs, emitter)
      const action = new AttackMonsterAction('a1', 'p1', 'monster-1', rm, emitter)
      expect(action.canExecute(emptyGs)).toBe(false)
    })

    it('returns false when player is not the current player', () => {
      gs.setCurrentPlayerId('p2')
      expect(makeAction().canExecute(gs)).toBe(false)
    })

    it('returns false when player has exactly 1 action point (cost is 2)', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', 1))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      gs2.registerCard(makeMonsterCard('monster-1'))
      gs2.getMonsterPile().add('monster-1')
      const rm = new ReactionManager(gs2, emitter)
      const action = new AttackMonsterAction('a1', 'p1', 'monster-1', rm, emitter)
      expect(action.canExecute(gs2)).toBe(false)
    })

    it('returns false when the monster is not in the monster pile', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', 3))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      gs2.registerCard(makeMonsterCard('monster-1'))
      // deliberately not adding monster-1 to the pile
      const rm = new ReactionManager(gs2, emitter)
      const action = new AttackMonsterAction('a1', 'p1', 'monster-1', rm, emitter)
      expect(action.canExecute(gs2)).toBe(false)
    })

    it('returns true when all conditions are met', () => {
      expect(makeAction().canExecute(gs)).toBe(true)
    })
  })

  // --- execute ---

  describe('execute', () => {
    it('always decreases player action points by 2', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.3) // Miss
      makeAction().execute(gs)
      expect(player.getActionPoints()).toBe(1)
    })

    describe('on a Slay roll (mock random 0.99 → roll 12 ≥ higherReq 8)', () => {
      beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0.99))

      it('removes the monster from the monster pile', () => {
        makeAction().execute(gs)
        expect(gs.getMonsterPile().getAll()).not.toContain('monster-1')
      })

      it('adds the monster to the player party', () => {
        makeAction().execute(gs)
        expect(party.getMonsterIds()).toContain('monster-1')
      })

      it('emits a MonsterSlain event', () => {
        makeAction().execute(gs)
        expect(emitSpy).toHaveBeenCalledTimes(1)
      })
    })

    describe('on a Miss roll (mock random 0.3 → roll 5, between lowerReq 3 and higherReq 8)', () => {
      beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0.3))

      it('does not remove the monster from the pile', () => {
        makeAction().execute(gs)
        expect(gs.getMonsterPile().getAll()).toContain('monster-1')
      })

      it('does not add the monster to the party', () => {
        makeAction().execute(gs)
        expect(party.getMonsterIds()).not.toContain('monster-1')
      })

      it('does not emit any events', () => {
        makeAction().execute(gs)
        expect(emitSpy).not.toHaveBeenCalled()
      })
    })

    describe('on a FightBack roll (mock random 0 → roll 1 ≤ lowerReq 3)', () => {
      beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0))

      it('does not remove the monster from the pile', () => {
        makeAction().execute(gs)
        expect(gs.getMonsterPile().getAll()).toContain('monster-1')
      })

      it('does not add the monster to the party (FightBack not yet implemented)', () => {
        makeAction().execute(gs)
        expect(party.getMonsterIds()).not.toContain('monster-1')
      })

      it('does not emit any events (FightBack not yet implemented)', () => {
        makeAction().execute(gs)
        expect(emitSpy).not.toHaveBeenCalled()
      })
    })
  })
})
