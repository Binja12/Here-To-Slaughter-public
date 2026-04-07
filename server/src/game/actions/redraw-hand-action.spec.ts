// NOTE: redraw-hand-action.ts exports a class named `DrawCardAction` — likely a
// copy-paste artifact. It is imported here under the alias `redrawHandAction`.
// The class also returns `ActionType.DrawCard` instead of `ActionType.ReDraw`;
// tests document current behaviour (not intended behaviour).
import { redrawHandAction } from './redraw-hand-action'
import { ActionType } from 'shared'
import { GameState } from '../game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../player'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'

// --- Helpers ---

const makePlayer = (id: string, ap = 3) =>
  new Player({
    id,
    name: `Player ${id}`,
    hand: [],
    partyId: `party-${id}`,
    actionPoints: ap,
  })

const makeGs = (deckCards: string[] = []) => {
  const deck = new CardStack('deck-1', 'main-deck')
  const discard = new CardPile('discard-1', 'discard-pile')
  const monsterDeck = new CardStack('mdeck-1', 'monster-deck')
  const monsterPile = new CardPile('mpile-1', 'monster-pile')
  for (const c of deckCards) deck.addToBottom(c)
  return new GameState(deck, discard, monsterDeck, monsterPile)
}

// --- Tests ---

describe('redrawHandAction (exported as DrawCardAction from redraw-hand-action.ts)', () => {
  let emitter: GameEventEmitter
  let emitSpy: jest.SpyInstance

  beforeEach(() => {
    emitter = new GameEventEmitter()
    emitSpy = jest.spyOn(emitter, 'emit')
  })

  // --- Metadata ---

  describe('metadata', () => {
    it('getId returns the action id', () => {
      const action = new redrawHandAction('a1', 'p1', emitter)
      expect(action.getId()).toBe('a1')
    })

    it('getType returns ActionType.ReDraw (BUG: should be ActionType.ReDraw)', () => {
      const action = new redrawHandAction('a1', 'p1', emitter)
      expect(action.getType()).toBe(ActionType.ReDraw)
    })

    it('getPlayerId returns the player id', () => {
      const action = new redrawHandAction('a1', 'p1', emitter)
      expect(action.getPlayerId()).toBe('p1')
    })

    it('getCost returns 3', () => {
      const action = new redrawHandAction('a1', 'p1', emitter)
      expect(action.getCost()).toBe(3)
    })
  })

  // --- canExecute ---

  describe('canExecute', () => {
    it('returns false when player does not exist', () => {
      const gs = makeGs(['c1', 'c2'])
      const action = new redrawHandAction('a1', 'p1', emitter)
      expect(action.canExecute(gs)).toBe(false)
    })

    it('returns false when player has fewer than 3 action points', () => {
      const gs = makeGs(['c1', 'c2'])
      gs.registerPlayer(makePlayer('p1', 2))
      const action = new redrawHandAction('a1', 'p1', emitter)
      expect(action.canExecute(gs)).toBe(false)
    })

    it('returns true when deck has exactly 5 cards', () => {
      const gs = makeGs(['c1', 'c2', 'c3', 'c4', 'c5'])
      gs.registerPlayer(makePlayer('p1', 3))
      const action = new redrawHandAction('a1', 'p1', emitter)
      expect(action.canExecute(gs)).toBe(true)
    })

    it('returns true when deck has more than 5 cards', () => {
      const gs = makeGs(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])
      gs.registerPlayer(makePlayer('p1', 3))
      const action = new redrawHandAction('a1', 'p1', emitter)
      expect(action.canExecute(gs)).toBe(true)
    })

    it('returns false when deck has 4 cards (< 5) and player has enough AP', () => {
      const gs = makeGs(['c1', 'c2', 'c3', 'c4'])
      gs.registerPlayer(makePlayer('p1', 3))
      const action = new redrawHandAction('a1', 'p1', emitter)
      expect(action.canExecute(gs)).toBe(false)
    })

    it('returns false when deck is empty', () => {
      const gs = makeGs([])
      gs.registerPlayer(makePlayer('p1', 3))
      const action = new redrawHandAction('a1', 'p1', emitter)
      expect(action.canExecute(gs)).toBe(false)
    })
  })

  // --- execute ---

  // NOTE: canExecute requires deck.size < 5, but execute always draws exactly 5
  // cards. Running execute on a deck with fewer than 5 cards will throw due to
  // the non-null assertion on draw(). Execute tests below use a deck pre-loaded
  // with 5+ cards to exercise the draw logic in isolation.
  describe('execute', () => {
    let gs: GameState
    let player: Player

    beforeEach(() => {
      gs = makeGs(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'])
      player = makePlayer('p1', 3)
      gs.registerPlayer(player)
    })

    it('decreases player action points by 3', () => {
      new redrawHandAction('a1', 'p1', emitter).execute(gs)
      expect(player.getActionPoints()).toBe(0)
    })

    it('draws exactly 5 cards into player hand in deck order', () => {
      new redrawHandAction('a1', 'p1', emitter).execute(gs)
      expect(player.getHand()).toHaveLength(5)
      expect(player.getHand()).toEqual(['c1', 'c2', 'c3', 'c4', 'c5'])
    })

    it('removes exactly 5 cards from the top of the deck', () => {
      new redrawHandAction('a1', 'p1', emitter).execute(gs)
      expect(gs.getMainDeck().getSize()).toBe(2)
    })

    it('emits a CardDrawn event for each drawn card (5 total)', () => {
      new redrawHandAction('a1', 'p1', emitter).execute(gs)
      expect(emitSpy).toHaveBeenCalledTimes(5)
    })
  })
})
