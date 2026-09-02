import { ICard } from 'shared'
import { PartyLeaderData, CardType, HeroClass } from 'shared'

export class PartyLeaderCard implements ICard {
  constructor(private data: PartyLeaderData) {}

  getData(): PartyLeaderData {
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
  getHeroClass(): HeroClass {
    return this.data.heroClass
  }
}
