import { ICard, IBoardCard } from 'shared'
import { MonsterCardData, CardType, SkillData, PartyReq } from 'shared'

export class MonsterCard implements ICard, IBoardCard {
  constructor(private data: MonsterCardData) {}

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
  getRollReq(): number {
    return this.data.rollWinReq
  }
  getFightBackRange(): number {
    return this.data.rollLoseReq
  }
  getPartyReq(): PartyReq {
    return this.data.partyReq
  }
  getSkill(): SkillData {
    return this.data.skill
  }
}
