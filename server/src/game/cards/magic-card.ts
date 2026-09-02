import { ICard } from 'shared'
import { MagicCardData, CardType } from 'shared'

export class MagicCard implements ICard {
  constructor(private data: MagicCardData) {}

  getData(): MagicCardData {
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
}
