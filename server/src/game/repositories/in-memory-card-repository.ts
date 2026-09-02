import {
  ICardRepository,
  CardBase,
  CardType,
  HeroClass,
  HeroCardData,
} from 'shared'

export class InMemoryCardRepository implements ICardRepository {
  private cards: CardBase[] = []

  add(card: CardBase): void {
    this.cards.push(card)
  }
  addMany(cards: CardBase[]): void {
    this.cards = this.cards.concat(cards)
  }
  getById(cardId: string): CardBase | null {
    return this.cards.find((card) => card.id === cardId) ?? null
  }
  getByType(type: CardType): CardBase[] {
    return this.cards.filter((card) => card.type === type)
  }
  getBySet(setName: string): CardBase[] {
    return this.cards.filter((card) => card.set === setName)
  }
  getAll(): CardBase[] {
    return this.cards
  }
  getAvailableClasses(): HeroClass[] {
    const classes = this.cards
      .filter((card) => card.type === CardType.Hero)
      .map((card) => (card as HeroCardData).heroClass)
    return [...new Set(classes)]
  }
}
