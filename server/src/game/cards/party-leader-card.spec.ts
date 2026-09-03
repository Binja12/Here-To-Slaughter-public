import { PartyLeaderCard } from './party-leader-card'
import { CardType, HeroClass } from 'shared'
import { PartyLeaderData } from 'shared'

const mockLeaderData: PartyLeaderData = {
  id: 'leader-1',
  name: 'The Shadow',
  type: CardType.Leader,
  image: 'shadow.png',
  description: 'A mysterious leader',
  heroClass: HeroClass.Thief,
  set: 'base',
}

describe('PartyLeaderCard', () => {
  it('should return id', () => {
    const card = new PartyLeaderCard(mockLeaderData)
    expect(card.getId()).toBe('leader-1')
  })

  it('should return name', () => {
    const card = new PartyLeaderCard(mockLeaderData)
    expect(card.getName()).toBe('The Shadow')
  })

  it('should return type as CardType.Leader', () => {
    const card = new PartyLeaderCard(mockLeaderData)
    expect(card.getType()).toBe(CardType.Leader)
  })

  it('should return image', () => {
    const card = new PartyLeaderCard(mockLeaderData)
    expect(card.getImage()).toBe('shadow.png')
  })

  it('should return description', () => {
    const card = new PartyLeaderCard(mockLeaderData)
    expect(card.getDescription()).toBe('A mysterious leader')
  })

  it('should return hero class', () => {
    const card = new PartyLeaderCard(mockLeaderData)
    expect(card.getHeroClass()).toBe(HeroClass.Thief)
  })
})
