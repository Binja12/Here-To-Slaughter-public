import { ActionType } from 'shared'
import { DrawCardAction } from './draw-card-action'
import { GameState } from '../game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../player'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'

// --- Helpers ---

const makePlayer = (id: string, hand: string[] = [], ap = 3) =>
  new Player({
    id,
    name: `Player ${id}`,
    hand,
    partyId: `party-${id}`,
    actionPoints: ap,
  })

const makeGs = (deckCards: string[] = []) => {
  const deck = new CardStack('deck-1', 'main-deck')
  const discard = new CardPile('discard-1', 'discard-pile')
  for (const c of deckCards) deck.addToBottom(c)
  return new GameState(
    deck,
    discard,
    new CardStack('mdeck-1', 'monster-deck'),
    new CardPile('mpile-1', 'monster-pile'),
  )
}

// --- Tests ---

describe('DrawCardAction', () => {
  let emitter: GameEventEmitter
  let emitSpy: jest.SpyInstance

  beforeEach(() => {
    emitter = new GameEventEmitter()
    emitSpy = jest.spyOn(emitter, 'emit')
  })

  // --- Metadata ---

  describe('metadata', () => {
    it('getId returns the action id', () => {
      const action = new DrawCardAction('a1', 'p1', emitter)
      expect(action.getId()).toBe('a1')
    })

    it('getType returns ActionType.DrawCard', () => {
      const action = new DrawCardAction('a1', 'p1', emitter)
      expect(action.getType()).toBe(ActionType.DrawCard)
    })

    it('getPlayerId returns the player id', () => {
      const action = new DrawCardAction('a1', 'p1', emitter)
      expect(action.getPlayerId()).toBe('p1')
    })

    it('getCost returns 1', () => {
      const action = new DrawCardAction('a1', 'p1', emitter)
      expect(action.getCost()).toBe(1)
    })
  })

  // --- canExecute ---

  describe('canExecute', () => {
    it('returns false when player does not exist', () => {
      const gs = makeGs(['card-1'])
      const action = new DrawCardAction('a1', 'unknown-player', emitter)
      expect(action.canExecute(gs)).toBe(false)
    })

    it('returns false when player has 0 action points', () => {
      const gs = makeGs(['card-1'])
      gs.registerPlayer(makePlayer('p1', [], 0))
      const action = new DrawCardAction('a1', 'p1', emitter)
      expect(action.canExecute(gs)).toBe(false)
    })

    it('returns false when player hand is full (10 cards)', () => {
      const fullHand = Array.from({ length: 10 }, (_, i) => `c${i}`)
      const gs = makeGs(['card-overflow'])
      gs.registerPlayer(makePlayer('p1', fullHand, 3))
      const action = new DrawCardAction('a1', 'p1', emitter)
      expect(action.canExecute(gs)).toBe(false)
    })

    it('returns false when the deck is empty', () => {
      const gs = makeGs([])
      gs.registerPlayer(makePlayer('p1'))
      const action = new DrawCardAction('a1', 'p1', emitter)
      expect(action.canExecute(gs)).toBe(false)
    })

    it('returns true when all conditions are met', () => {
      const gs = makeGs(['card-1'])
      gs.registerPlayer(makePlayer('p1'))
      const action = new DrawCardAction('a1', 'p1', emitter)
      expect(action.canExecute(gs)).toBe(true)
    })
  })

  // --- execute ---

  describe('execute', () => {
    let gs: GameState
    let player: Player

    beforeEach(() => {
      gs = makeGs(['card-1', 'card-2'])
      player = makePlayer('p1')
      gs.registerPlayer(player)
    })

    it('decreases player action points by 1', () => {
      new DrawCardAction('a1', 'p1', emitter).execute(gs)
      expect(player.getActionPoints()).toBe(2)
    })

    it('moves the top card from the deck to the player hand', () => {
      new DrawCardAction('a1', 'p1', emitter).execute(gs)
      expect(player.getHand()).toContain('card-1')
      expect(gs.getMainDeck().getSize()).toBe(1)
    })

    it('emits exactly one event', () => {
      new DrawCardAction('a1', 'p1', emitter).execute(gs)
      expect(emitSpy).toHaveBeenCalledTimes(1)
    })
  })
})
