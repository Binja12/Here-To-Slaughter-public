import { ActionType, Audience, GameEventType } from 'shared'
import { DrawCardAction } from './draw-card-action'
import { GameState } from '../game-state'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'

const makeGs = (
  deckCards: string[] = [],
  handCards: string[] = [],
  actionPoints = 3,
) => {
  const deck = new CardStack('deck', 'main')
  for (const c of deckCards) deck.addToBottom(c)
  const player = new Player({
    id: 'p1',
    name: 'Player 1',
    hand: handCards,
    partyId: 'party-1',
    actionPoints,
  })
  const party = new Party({
    playerId: 'p1',
    leaderId: 'leader-1',
    heroIds: [],
    MonsterIds: [],
  })
  const gs = new GameState(deck)
  gs.registerPlayer(player)
  gs.registerParty(party)
  return { gs, player }
}

describe('DrawCardAction', () => {
  it('should have type DrawCard', () => {
    expect(new DrawCardAction('draw-1', 'p1').getType()).toBe(
      ActionType.DrawCard,
    )
  })

  it('should return the injected id', () => {
    expect(new DrawCardAction('my-id', 'p1').getId()).toBe('my-id')
  })

  it('should have cost 1', () => {
    expect(new DrawCardAction('draw-1', 'p1').getCost()).toBe(1)
  })

  it('should not be challengeable', () => {
    expect(new DrawCardAction('draw-1', 'p1').isChallengeable()).toBe(false)
  })

  describe('canExecute()', () => {
    it('should return false for unknown player', () => {
      const { gs } = makeGs(['card-1'])
      expect(new DrawCardAction('d', 'unknown').canExecute(gs)).toBe(false)
    })

    it('should return false when player has no action points', () => {
      const { gs } = makeGs(['card-1'], [], 0)
      expect(new DrawCardAction('d', 'p1').canExecute(gs)).toBe(false)
    })

    it('should return false when deck is empty', () => {
      const { gs } = makeGs([])
      expect(new DrawCardAction('d', 'p1').canExecute(gs)).toBe(false)
    })

    it('should return false when hand is full (10 cards)', () => {
      const hand = Array.from({ length: 10 }, (_, i) => `c${i}`)
      const { gs } = makeGs(['extra'], hand)
      expect(new DrawCardAction('d', 'p1').canExecute(gs)).toBe(false)
    })

    it('should return true when conditions are met', () => {
      const { gs } = makeGs(['card-1'])
      expect(new DrawCardAction('d', 'p1').canExecute(gs)).toBe(true)
    })
  })

  describe('execute()', () => {
    it('should add the drawn card to the player hand', () => {
      const { gs, player } = makeGs(['card-1'])
      new DrawCardAction('d', 'p1').execute(gs)
      expect(player.getHand()).toContain('card-1')
    })

    it('should remove the card from the deck', () => {
      const { gs } = makeGs(['card-1'])
      new DrawCardAction('d', 'p1').execute(gs)
      expect(gs.getMainDeck().getSize()).toBe(0)
    })

    it('should deduct 1 action point from the player', () => {
      const { gs, player } = makeGs(['card-1'], [], 3)
      new DrawCardAction('d', 'p1').execute(gs)
      expect(player.getActionPoints()).toBe(2)
    })

    it('should emit a CardDrawn event with PlayerOnly audience', () => {
      const { gs } = makeGs(['card-1'])
      const events = new DrawCardAction('d', 'p1').execute(gs)
      expect(events).toHaveLength(1)
      expect(events[0].getType()).toBe(GameEventType.CardDrawn)
      expect(events[0].getAudience()).toBe(Audience.PlayerOnly)
      expect((events[0].getPayload() as any).cardId).toBe('card-1')
    })

    it('should return empty array when deck is empty (safety guard)', () => {
      const { gs } = makeGs([])
      expect(new DrawCardAction('d', 'p1').execute(gs)).toHaveLength(0)
    })
  })
})
