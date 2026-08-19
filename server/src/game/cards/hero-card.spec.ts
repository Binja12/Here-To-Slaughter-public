import { HeroCard } from './hero-card'
import { CardType, HeroClass } from 'shared'
import { HeroCardData } from 'shared'
import { GameState } from '../game-state'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { GameEventEmitter } from '../events/game-event-emitter'

const mockHeroData: HeroCardData = {
  id: 'hero-1',
  name: 'Zara the Wizard',
  type: CardType.Hero,
  image: 'zara.png',
  description: 'A powerful wizard',
  heroClass: HeroClass.Wizard,
  rollReq: 4,
  set: 'base',
}

describe('HeroCard', () => {
  it('should return id', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getId()).toBe('hero-1')
  })

  it('should return name', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getName()).toBe('Zara the Wizard')
  })

  it('should return type as CardType.Hero', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getType()).toBe(CardType.Hero)
  })

  it('should return image', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getImage()).toBe('zara.png')
  })

  it('should return description', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getDescription()).toBe('A powerful wizard')
  })

  it('should return hero class', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getHeroClass()).toBe(HeroClass.Wizard)
  })

  it('should return roll requirement', () => {
    const card = new HeroCard(mockHeroData)
    expect(card.getRollReq()).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// Equipment lives on the party, so these ask the board. The GameState import
// is type-only, so there is no runtime edge back from a card to the board.
// ---------------------------------------------------------------------------

const makeBoard = (heroIds: string[] = ['hero-1']) => {
  const gs = new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )
  gs.registerParty(
    new Party({
      playerId: 'p1',
      leaderId: 'p1-leader',
      heroIds,
      monsterIds: [],
    }),
  )
  return gs
}

describe('HeroCard — equipment', () => {
  it('reports what the party says it carries', () => {
    const gs = makeBoard()
    gs.getParty('p1').equipItem('hero-1', 'item-1')

    expect(new HeroCard(mockHeroData).getEquippedItem(gs)).toBe('item-1')
  })

  it('reports nothing when it carries nothing', () => {
    expect(new HeroCard(mockHeroData).getEquippedItem(makeBoard())).toBeUndefined()
  })

  it('reports nothing once it has left the party', () => {
    const gs = makeBoard()
    gs.getParty('p1').equipItem('hero-1', 'item-1')
    gs.getParty('p1').removeHero('hero-1', new GameEventEmitter(), 'Destroyed')

    expect(new HeroCard(mockHeroData).getEquippedItem(gs)).toBeUndefined()
  })
})
