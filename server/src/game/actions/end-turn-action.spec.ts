import { ActionType, RefusalReason, TurnPhase } from 'shared'
import { EndTurnAction } from './end-turn-action'
import { TurnManager } from '../pipelines/turn-manager'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameState } from '../pipelines/game-state'
import { Player } from '../state-structures/player'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'

const makePlayer = (id: string, ap = 3) =>
  new Player({
    id,
    name: `Player ${id}`,
    hand: [],
    partyId: `party-${id}`,
    actionPoints: ap,
  })

const makeGs = () =>
  new GameState(
    new CardStack('deck-1', 'main-deck'),
    new CardPile('discard-1', 'discard-pile'),
    new CardStack('mdeck-1', 'monster-deck'),
    new CardPile('mpile-1', 'monster-pile'),
  )

describe('EndTurnAction', () => {
  describe('metadata', () => {
    const action = new EndTurnAction('a1', 'p1')

    it('getId returns the action id', () => {
      expect(action.getId()).toBe('a1')
    })

    it('getType returns ActionType.EndTurn', () => {
      expect(action.getType()).toBe(ActionType.EndTurn)
    })

    it('getPlayerId returns the player id', () => {
      expect(action.getPlayerId()).toBe('p1')
    })

    it('costs nothing', () => {
      expect(action.getCost()).toBe(0)
    })

    it('is not reactable', () => {
      expect(action.isReactable()).toBe(false)
    })
  })

  describe('canExecute', () => {
    it('throws when the player is not seated — an engine mistake, not a refusal', () => {
      expect(() => new EndTurnAction('a1', 'nobody').canExecute(makeGs())).toThrow(/not seated/)
    })

    it('returns true with no points left — a pass needs no budget', () => {
      const gs = makeGs()
      gs.registerPlayer(makePlayer('p1', 0))
      expect(new EndTurnAction('a1', 'p1').canExecute(gs)).toEqual({ accepted: true })
    })
  })

  // Whose turn it is lives in the QUEUE, not in any action (engine doc §1):
  // TurnManager.enqueue refuses before canExecute is asked, so no action
  // can forget the rule and a pass cannot end somebody else's turn.
  describe('through the door', () => {
    it('is refused as NotYourTurn when another player sends it', () => {
      const gs = makeGs()
      gs.registerPlayer(makePlayer('p1'))
      gs.registerPlayer(makePlayer('p2'))
      const tm = new TurnManager(gs, new GameEventEmitter())
      tm.startTurn('p1')

      const result = tm.enqueue(new EndTurnAction('a1', 'p2'))

      expect(result).toEqual({ accepted: false, reason: RefusalReason.NotYourTurn })
      expect(gs.getCurrentPlayerId()).toBe('p1')
      expect(tm.getPhase()).toBe(TurnPhase.Action)
      expect(gs.getPlayer('p1')!.getActionPoints()).toBe(3)
    })
  })

  describe('execute', () => {
    it('spends every remaining point', () => {
      const gs = makeGs()
      const player = makePlayer('p1', 3)
      gs.registerPlayer(player)

      new EndTurnAction('a1', 'p1').execute(gs)

      expect(player.getActionPoints()).toBe(0)
    })

    it('leaves a spent budget at zero, not below it', () => {
      const gs = makeGs()
      const player = makePlayer('p1', 0)
      gs.registerPlayer(player)

      new EndTurnAction('a1', 'p1').execute(gs)

      expect(player.getActionPoints()).toBe(0)
    })
  })
})
