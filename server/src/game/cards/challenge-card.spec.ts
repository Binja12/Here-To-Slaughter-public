import { ChallengeCard } from './challenge-card'
import { CardType, GameEventType } from 'shared'
import { ChallengeCardData } from 'shared'

const mockChallengeData: ChallengeCardData = {
  id: 'challenge-1',
  name: 'Not So Fast',
  type: CardType.Challenge,
  image: 'challenge.png',
  description: 'Counter any card play',
  set: '',
  ability: { trigger: GameEventType.CardPlayed },
}

describe('ChallengeCard', () => {
  it('should return id', () => {
    const card = new ChallengeCard(mockChallengeData)
    expect(card.getId()).toBe('challenge-1')
  })

  it('should return name', () => {
    const card = new ChallengeCard(mockChallengeData)
    expect(card.getName()).toBe('Not So Fast')
  })

  it('should return type as CardType.Challenge', () => {
    const card = new ChallengeCard(mockChallengeData)
    expect(card.getType()).toBe(CardType.Challenge)
  })

  it('should return image', () => {
    const card = new ChallengeCard(mockChallengeData)
    expect(card.getImage()).toBe('challenge.png')
  })

  it('should return description', () => {
    const card = new ChallengeCard(mockChallengeData)
    expect(card.getDescription()).toBe('Counter any card play')
  })
})
