import { ICard } from 'shared'
import type { GameState } from '../pipelines/game-state'
import { ItemCardData, CardType } from 'shared'

export class ItemCard implements ICard {
  constructor(private data: ItemCardData) {}

  getData(): ItemCardData {
    return { ...this.data }
  }

  getId(): string {
    return this.data.id
  }
  getName(): string {
    return this.data.name
  }
  getType(): CardType {
    return this.data.type
  }
  getImage(): string {
    return this.data.image
  }
  getDescription(): string {
    return this.data.description
  }
  /**
   * The hero wearing this, or nothing once it has left play. The other half of
   * HeroCard.getEquippedItem — same reason it takes the board.
   */
  getEquippedTo(gs: GameState): string | undefined {
    return gs.getItemCarrier(this.getId())
  }

  isCursed(): boolean {
    return this.data.cursed
  }

  clone(): ItemCard {
    return new ItemCard({ ...this.data })
  }
}
