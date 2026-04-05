import {
  ActionType,
  Audience,
  CardType,
  EffectDuration,
  GameEventType,
  HeroClass,
} from 'shared'
import { PlayCardAction } from './play-card-action'
import { GameState } from '../game-state'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { HeroCard } from '../cards/hero-card'
import { MagicCard } from '../cards/magic-card'

const makeHeroCard = (id: string) =>
  new HeroCard({
    id,
    name: `Hero ${id}`,
    type: CardType.Hero,
    image: '',
    description: '',
    heroClass: HeroClass.Wizard,
    rollReq: 4,
    effect: { duration: EffectDuration.TurnEnd },
  })

const makeMagicCard = (id: string) =>
  new MagicCard({
    id,
    name: `Magic ${id}`,
    type: CardType.Magic,
    image: '',
    description: '',
    effect: { duration: EffectDuration.TurnEnd },
  })

const makeGs = (handCards: string[], registeredCards: any[] = []) => {
  const deck = new CardStack('deck', 'main')
  const player = new Player({
    id: 'p1',
    name: 'P1',
    hand: handCards,
    partyId: 'party-1',
    actionPointsPerTurn: 3,
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
  for (const card of registeredCards) gs.registerCard(card)
  return { gs, player, party }
}

describe('PlayCardAction', () => {
  it('should have type PlayCard', () => {
    expect(new PlayCardAction('p1', 'card-1').getType()).toBe(
      ActionType.PlayCard,
    )
  })

  it('should have cost 1', () => {
    expect(new PlayCardAction('p1', 'card-1').getCost()).toBe(1)
  })

  it('should be challengeable', () => {
    expect(new PlayCardAction('p1', 'card-1').isChallengeable()).toBe(true)
  })

  describe('canExecute()', () => {
    it('should return false for unknown player', () => {
      const hero = makeHeroCard('hero-1')
      const { gs } = makeGs(['hero-1'], [hero])
      expect(new PlayCardAction('unknown', 'hero-1').canExecute(gs)).toBe(false)
    })

    it('should return false when card not in hand', () => {
      const hero = makeHeroCard('hero-1')
      const { gs } = makeGs([], [hero])
      expect(new PlayCardAction('p1', 'hero-1').canExecute(gs)).toBe(false)
    })

    it('should return false when card not registered in game state', () => {
      const { gs } = makeGs(['hero-1'], [])
      expect(new PlayCardAction('p1', 'hero-1').canExecute(gs)).toBe(false)
    })

    it('should return true when card is in hand and registered', () => {
      const hero = makeHeroCard('hero-1')
      const { gs } = makeGs(['hero-1'], [hero])
      expect(new PlayCardAction('p1', 'hero-1').canExecute(gs)).toBe(true)
    })
  })

  describe('execute() — Hero card', () => {
    it('should remove hero from hand', () => {
      const hero = makeHeroCard('hero-1')
      const { gs, player } = makeGs(['hero-1'], [hero])
      new PlayCardAction('p1', 'hero-1').execute(gs)
      expect(player.getHand()).not.toContain('hero-1')
    })

    it('should add hero to party', () => {
      const hero = makeHeroCard('hero-1')
      const { gs, party } = makeGs(['hero-1'], [hero])
      new PlayCardAction('p1', 'hero-1').execute(gs)
      expect(party.getHeroIds()).toContain('hero-1')
    })

    it('should emit HeroAdded event with All audience', () => {
      const hero = makeHeroCard('hero-1')
      const { gs } = makeGs(['hero-1'], [hero])
      const events = new PlayCardAction('p1', 'hero-1').execute(gs)
      expect(events).toHaveLength(1)
      expect(events[0].getType()).toBe(GameEventType.HeroAdded)
      expect(events[0].getAudience()).toBe(Audience.All)
      expect((events[0].getPayload() as any).cardId).toBe('hero-1')
    })
  })

  describe('execute() — non-Hero card', () => {
    it('should remove magic card from hand', () => {
      const magic = makeMagicCard('magic-1')
      const { gs, player } = makeGs(['magic-1'], [magic])
      new PlayCardAction('p1', 'magic-1').execute(gs)
      expect(player.getHand()).not.toContain('magic-1')
    })

    it('should emit CardPlayed event for non-Hero cards', () => {
      const magic = makeMagicCard('magic-1')
      const { gs } = makeGs(['magic-1'], [magic])
      const events = new PlayCardAction('p1', 'magic-1').execute(gs)
      expect(events[0].getType()).toBe(GameEventType.CardPlayed)
    })
  })
})
