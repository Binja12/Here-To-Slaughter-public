import { ActionType, CardType } from 'shared'
import { PlayMagicAction } from './play-magic-action'
import { GameState } from '../game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { ReactionManager } from '../reactions/reaction-manager'
import { MagicCard } from '../cards/magic-card'

// --- Helpers ---

const makePlayer = (id: string, hand: string[] = [], ap = 3) =>
  new Player({ id, name: `Player ${id}`, hand, partyId: `party-${id}`, actionPoints: ap })

const makeParty = (playerId: string) =>
  new Party({ playerId, leaderId: `leader-${playerId}`, heroIds: [], monsterIds: [] })

const makeMagicCard = (id: string) =>
  new MagicCard({
    id,
    name: `Magic ${id}`,
    type: CardType.Magic,
    image: '',
    description: '',
    set: '',
    ability: { trigger: [], steps: [] },
  })

const makeGs = () => {
  const deck = new CardStack('deck-1', 'main-deck')
  const discard = new CardPile('discard-1', 'discard-pile')
  return new GameState(deck, discard)
}

// --- Tests ---

describe('PlayMagicAction', () => {
  let emitter: GameEventEmitter
  let gs: GameState
  let player: Player

  beforeEach(() => {
    emitter = new GameEventEmitter()
    gs = makeGs()
    player = makePlayer('p1', ['magic-1'])
    gs.registerPlayer(player)
    gs.registerParty(makeParty('p1'))
    gs.setCurrentPlayerId('p1')
    gs.registerCard(makeMagicCard('magic-1'))
  })

  const makeAction = () => {
    const rm = new ReactionManager(gs, emitter, () => {})
    return new PlayMagicAction('a1', 'p1', 'magic-1', rm, emitter)
  }

  // --- Metadata ---

  describe('metadata', () => {
    it('getId returns the action id', () => {
      expect(makeAction().getId()).toBe('a1')
    })

    it('getType returns ActionType.PlayCard', () => {
      expect(makeAction().getType()).toBe(ActionType.PlayCard)
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
      emptyGs.setCurrentPlayerId('p1')
      const rm = new ReactionManager(emptyGs, emitter, () => {})
      const action = new PlayMagicAction('a1', 'p1', 'magic-1', rm, emitter)
      expect(action.canExecute(emptyGs)).toBe(false)
    })

    it('returns false when player is not the current player', () => {
      gs.setCurrentPlayerId('p2')
      expect(makeAction().canExecute(gs)).toBe(false)
    })

    it('returns false when player has insufficient action points', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', ['magic-1'], 0))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      const rm = new ReactionManager(gs2, emitter, () => {})
      const action = new PlayMagicAction('a1', 'p1', 'magic-1', rm, emitter)
      expect(action.canExecute(gs2)).toBe(false)
    })

    it('returns false when card is not in player hand', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', []))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      const rm = new ReactionManager(gs2, emitter, () => {})
      const action = new PlayMagicAction('a1', 'p1', 'magic-1', rm, emitter)
      expect(action.canExecute(gs2)).toBe(false)
    })

    it('returns true when all conditions are met', () => {
      expect(makeAction().canExecute(gs)).toBe(true)
    })
  })

  // --- execute ---

  // NOTE: PlayMagicAction.execute() references an undefined variable `ctx` when
  // calling AbilityProcessor.process(). This is a bug in the source — `ctx` is
  // never declared in the method body. The method will always throw a
  // ReferenceError. Tests below document this known bug; update them once fixed.
  describe('execute (known bug: ctx is not defined)', () => {
    it('throws a ReferenceError because ctx is not declared', () => {
      expect(() => makeAction().execute(gs)).toThrow(ReferenceError)
    })
  })
})
