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

  /**
   * Take one named card out. A pile is face up, so the caller can always name
   * what it wants — there is no blind draw here, which is exactly what
   * separates a pile from a CardStack.
   *
   * Null when the card is not in this pile.
   */
  pick(cardId: string): string | null {
    if (!this.cards.includes(cardId)) return null
    this.cards = this.cards.filter((id) => id !== cardId)
    return cardId
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
