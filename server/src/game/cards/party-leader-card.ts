import { ICard, IBoardCard } from 'shared'
import { PartyLeaderData, CardType, HeroClass, SkillData } from 'shared'

export class PartyLeaderCard implements ICard, IBoardCard {
  constructor(private data: PartyLeaderData) {}

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
  getAbility() {
    return this.getAbility
  }
}
