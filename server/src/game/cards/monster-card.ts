import { ICard, RollResult, RollCompareMode } from 'shared'
import { MonsterCardData, CardType, SkillData, PartyReq } from 'shared'

export class MonsterCard implements ICard {
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
  getPartyReq(): PartyReq {
    return this.data.partyReq
  }
  trySlay(roll: number): RollResult {
    if (this.data.rollCompareMode === RollCompareMode.HighToWin) {
      return roll >= this.data.higherReq
        ? RollResult.Slay
        : roll <= this.data.lowerReq
          ? RollResult.FightBack
          : RollResult.Miss
    } else {
      return roll <= this.data.higherReq
        ? RollResult.Slay
        : roll >= this.data.lowerReq
          ? RollResult.FightBack
          : RollResult.Miss
    }
  }
}
