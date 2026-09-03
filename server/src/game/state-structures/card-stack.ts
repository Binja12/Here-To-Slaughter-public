import { ICardStack } from 'shared'

export class CardStack implements ICardStack {
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
  draw(): string | null {
    return this.cards.shift() ?? null
  }
  addToTop(cardId: string): void {
    this.cards.unshift(cardId)
  }
  addToBottom(cardId: string): void {
    this.cards.push(cardId)
  }
  shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]]
    }
  }
  getSize(): number {
    return this.cards.length
  }

  clone(): CardStack {
    const copy = new CardStack(this.id, this.name)
    for (const c of this.cards) copy.addToBottom(c)
    return copy
  }
}
