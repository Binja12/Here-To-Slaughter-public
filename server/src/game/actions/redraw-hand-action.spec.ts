import { ActionType, GameEventType, IGameEvent } from 'shared'
import { RedrawHandAction } from './redraw-hand-action'
import { GameState } from '../pipelines/game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../state-structures/player'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'

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
  for (const c of deckCards) deck.addToBottom(c)
  return new GameState(
    deck,
    new CardPile('discard-1', 'discard-pile'),
    new CardStack('mdeck-1', 'monster-deck'),
    new CardPile('mpile-1', 'monster-pile'),
  )
}

describe('RedrawHandAction', () => {
  let emitter: GameEventEmitter
  let emitted: IGameEvent[]

  beforeEach(() => {
    emitter = new GameEventEmitter()
    emitted = []
    emitter.addListener({ onEvent: (e) => emitted.push(e) })
  })

  describe('metadata', () => {
    const action = () => new RedrawHandAction('a1', 'p1', emitter)

    it('getId returns the action id', () => {
      expect(action().getId()).toBe('a1')
    })

    it('getType returns ActionType.ReDraw', () => {
      expect(action().getType()).toBe(ActionType.ReDraw)
    })

    it('getPlayerId returns the player id', () => {
      expect(action().getPlayerId()).toBe('p1')
    })

    it('costs 3 — the whole budget', () => {
      expect(action().getCost()).toBe(3)
    })

    it('is not reactable', () => {
      expect(action().isReactable()).toBe(false)
    })
  })

  describe('canExecute', () => {
    it('returns false when the player does not exist', () => {
      expect(
        new RedrawHandAction('a1', 'nobody', emitter).canExecute(makeGs()),
      ).toBe(false)
    })

    it('returns false with fewer than 3 points', () => {
      const gs = makeGs(['d1'])
      gs.registerPlayer(makePlayer('p1', [], 2))
      expect(new RedrawHandAction('a1', 'p1', emitter).canExecute(gs)).toBe(
        false,
      )
    })

    it('returns true with the budget, whatever the deck holds', () => {
      // The deck runs back from the discard, so its size is not a guard.
      const gs = makeGs([])
      gs.registerPlayer(makePlayer('p1', ['h1'], 3))
      expect(new RedrawHandAction('a1', 'p1', emitter).canExecute(gs)).toBe(
        true,
      )
    })
  })

  describe('execute', () => {
    it('spends 3, discards the hand and draws five', () => {
      const gs = makeGs(['d1', 'd2', 'd3', 'd4', 'd5', 'd6'])
      const player = makePlayer('p1', ['h1', 'h2'])
      gs.registerPlayer(player)

      new RedrawHandAction('a1', 'p1', emitter).execute(gs)

      expect(player.getActionPoints()).toBe(0)
      expect(player.getHand()).toEqual(['d1', 'd2', 'd3', 'd4', 'd5'])
      expect(gs.getDiscardPile().getAll().sort()).toEqual(['h1', 'h2'])
      expect(
        emitted.filter((e) => e.getType() === GameEventType.CardDiscarded),
      ).toHaveLength(2)
      expect(
        emitted.filter((e) => e.getType() === GameEventType.CardDrawn),
      ).toHaveLength(5)
    })
  })
})
