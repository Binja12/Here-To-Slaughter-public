import { ICard } from 'shared'
import { HeroCardData, HeroClass, CardType } from 'shared'

export class HeroCard implements ICard {
  constructor(private data: HeroCardData) {}

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
  getHeroClass(): HeroClass {
    return this.data.heroClass
  }
  getRollReq(): number {
    return this.data.rollReq
  }
  getEquippedItem(): string | null {
    return this.data.equippedItem ?? null
  }
  equipItem(itemId: string): void {
    this.data.equippedItem = itemId
  }

  clone(): HeroCard {
    return new HeroCard({ ...this.data })
  }
}
