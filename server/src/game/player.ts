import { PlayerData } from 'shared'

export class Player {
  constructor(private data: PlayerData) {}

  getId(): string {
    return this.data.id
  }
  getName(): string {
    return this.data.name
  }
  getHand(): string[] {
    return this.data.hand
  }
  getHandSize(): number {
    return this.data.hand.length
  }
  getPartyId(): string {
    return this.data.partyId
  }
  getActionPointsPerTurn(): number {
    return this.data.actionPointsPerTurn
  }
  getData(): PlayerData {
    return this.data
  }

  addToHand(cardId: string): void {
    this.data.hand.push(cardId)
  }
  removeFromHand(cardId: string): void {
    this.data.hand = this.data.hand.filter((id) => id !== cardId)
  }
  clone(): Player {
    return new Player({
      ...this.data,
      hand: [...this.data.hand],
    })
  }
}
