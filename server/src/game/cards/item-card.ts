import { ICard } from 'shared'
import { ItemCardData, CardType, EffectData } from 'shared'

export class ItemCard implements ICard {
  constructor(private data: ItemCardData) {}

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
  getAbility(): AbilityData {
    return this.data.ability
  }
  isCursed(): boolean {
    return this.data.cursed
  }
  getEquippedTo(): string | null {
    return this.data.equippedHero ?? null
  }
  equipTo(heroId: string): void {
    this.data.equippedHero = heroId
  }
}
