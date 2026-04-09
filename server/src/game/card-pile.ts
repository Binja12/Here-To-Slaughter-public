import { ICardPile } from 'shared'

export class CardPile implements ICardPile {
  private cards: string[] = []

  constructor(
    private id: string,
    private name: string,
  ) {}

  getId(): string {
    return this.id
  }

  getName(): string {
    return this.name
  }

  pick(cardId?: string): string | null {
    let pickedCard: string | null = null
    if (cardId) {
      pickedCard = this.cards.find((id) => id === cardId) ?? null
      if (!pickedCard) return null
      this.cards = this.cards.filter((id) => id !== cardId)
    } else {
      if (this.cards.length === 0) return null
      const n = Math.floor(Math.random() * this.cards.length)
      pickedCard = this.cards[n]
      this.cards = this.cards.filter((id) => id !== pickedCard)
    }
    return pickedCard
  }

  add(cardId: string): void {
    this.cards.unshift(cardId)
  }

  getAll(): string[] {
    return this.cards
  }

  getSize(): number {
    return this.cards.length
  }

  clone(): CardPile {
    const copy = new CardPile(this.id, this.name)
    for (const c of [...this.cards].reverse()) copy.add(c)
    return copy
  }
}
