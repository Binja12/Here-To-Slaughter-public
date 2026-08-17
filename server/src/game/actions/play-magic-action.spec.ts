import {
  ActionType,
  CardType,
  GameEventType,
  IGameEvent,
  TriggerScope,
} from 'shared'
import { PlayMagicAction } from './play-magic-action'
import { GameState } from '../game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { ReactionManager } from '../reactions/reaction-manager'
import { MagicCard } from '../cards/magic-card'
import { AbilityProcessor } from '../ability-processor'
import { IAbility } from '../interfaces'

// --- Helpers ---

const makePlayer = (id: string, hand: string[] = [], ap = 3) =>
  new Player({
    id,
    name: `Player ${id}`,
    hand,
    partyId: `party-${id}`,
    actionPoints: ap,
  })

const makeParty = (playerId: string) =>
  new Party({
    playerId,
    leaderId: `leader-${playerId}`,
    heroIds: [],
    monsterIds: [],
  })

const makeMagicCard = (id: string) =>
  new MagicCard({
    id,
    name: `Magic ${id}`,
    type: CardType.Magic,
    image: '',
    description: '',
    set: '',
  })

/** Behaviour is bound by card id in the registry, never on the card's data. */
const spyAbility = (taskSpy: jest.Mock): IAbility => ({
  trigger: { on: GameEventType.MagicPlayed, scope: TriggerScope.SelfCard },
  steps: [{ execute: () => taskSpy() }],
})

const makeGs = () => {
  const deck = new CardStack('deck-1', 'main-deck')
  const discardPile = new CardPile('discard pile', 'discard pile')
  const monsterDeck = new CardStack('monster deck', 'main monster deck')
  const monsterPile = new CardPile('slayable monsters', 'monster pile')
  return new GameState(deck, discardPile, monsterDeck, monsterPile)
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
    const rm = new ReactionManager(gs, emitter)
    return new PlayMagicAction('a1', 'p1', 'magic-1', rm, emitter)
  }

  // --- Metadata ---

  describe('metadata', () => {
    it('getId returns the action id', () => {
      expect(makeAction().getId()).toBe('a1')
    })

    it('getType returns ActionType.PlayMagic', () => {
      expect(makeAction().getType()).toBe(ActionType.PlayMagic)
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
      const rm = new ReactionManager(emptyGs, emitter)
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
      const rm = new ReactionManager(gs2, emitter)
      const action = new PlayMagicAction('a1', 'p1', 'magic-1', rm, emitter)
      expect(action.canExecute(gs2)).toBe(false)
    })

    it('returns false when card is not in player hand', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', []))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      const rm = new ReactionManager(gs2, emitter)
      const action = new PlayMagicAction('a1', 'p1', 'magic-1', rm, emitter)
      expect(action.canExecute(gs2)).toBe(false)
    })

    it('returns true when all conditions are met', () => {
      expect(makeAction().canExecute(gs)).toBe(true)
    })
  })

  // --- execute ---

  describe('execute', () => {
    it('decreases action points by 1', () => {
      new AbilityProcessor(gs, emitter, new ReactionManager(gs, emitter))
      makeAction().execute(gs)
      expect(gs.getPlayer('p1')!.getActionPoints()).toBe(2)
    })

    it('removes card from hand', () => {
      new AbilityProcessor(gs, emitter, new ReactionManager(gs, emitter))
      makeAction().execute(gs)
      expect(gs.getPlayer('p1')!.getHand()).not.toContain('magic-1')
    })

    it('card ends up in discard pile after resolve', () => {
      new AbilityProcessor(gs, emitter, new ReactionManager(gs, emitter))
      makeAction().execute(gs)
      expect(gs.getDiscardPile().getAll()).toContain('magic-1')
    })

    it('card is not in instance pile after resolve', () => {
      new AbilityProcessor(gs, emitter, new ReactionManager(gs, emitter))
      makeAction().execute(gs)
      expect(gs.getParty('p1').getInstanceCardIds()).not.toContain('magic-1')
    })

    it('emits MagicPlayed event with cardId in payload', () => {
      new AbilityProcessor(gs, emitter, new ReactionManager(gs, emitter))
      const emitted: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => emitted.push(e) })
      makeAction().execute(gs)
      const magicPlayed = emitted.find(
        (e) => e.getType() === GameEventType.MagicPlayed,
      )
      expect(magicPlayed).toBeDefined()
      expect((magicPlayed!.getPayload() as { cardId: string }).cardId).toBe(
        'magic-1',
      )
    })

    it('emits CardDiscarded after ability resolves', () => {
      new AbilityProcessor(gs, emitter, new ReactionManager(gs, emitter))
      const emitted: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => emitted.push(e) })
      makeAction().execute(gs)
      const discarded = emitted.find(
        (e) => e.getType() === GameEventType.CardDiscarded,
      )
      expect(discarded).toBeDefined()
    })

    it('executes the magic card ability tasks via AbilityProcessor', () => {
      const taskSpy = jest.fn()
      gs.registerCard(makeMagicCard('magic-1'))
      new AbilityProcessor(
        gs,
        emitter,
        new ReactionManager(gs, emitter),
        new Map([['magic-1', spyAbility(taskSpy)]]),
      )
      makeAction().execute(gs)
      expect(taskSpy).toHaveBeenCalledTimes(1)
    })

    it('card is in instance pile when MagicPlayed fires', () => {
      let inInstanceAtEmit = false
      emitter.addListener({
        onEvent: (e) => {
          if (e.getType() === GameEventType.MagicPlayed) {
            inInstanceAtEmit = gs
              .getParty('p1')
              .getInstanceCardIds()
              .includes('magic-1')
          }
        },
      })
      new AbilityProcessor(gs, emitter, new ReactionManager(gs, emitter))
      makeAction().execute(gs)
      expect(inInstanceAtEmit).toBe(true)
    })
  })
})
