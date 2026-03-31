import { ICard } from 'shared'
import { ChallengeCardData, CardType } from 'shared'

export class ChallengeCard implements ICard {
  constructor(private data: ChallengeCardData) {}

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
