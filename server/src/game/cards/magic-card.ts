import { ICard } from 'shared'
import { MagicCardData, CardType, EffectData } from 'shared'

export class MagicCard implements ICard {
  constructor(private data: MagicCardData) {}

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
  getEffect(): EffectData {
    return this.data.effect
  }
}
