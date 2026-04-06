import { ICard } from 'shared'
import { ModifierCardData, CardType } from 'shared'

export class ModifierCard implements ICard {
  constructor(private data: ModifierCardData) {}

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
  getAbility() {
    return this.data.ability
  }
  getValues() {
    this.data.values
  }
}
