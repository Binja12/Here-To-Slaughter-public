import { RollResult, RollCompareMode } from 'shared'
import { IRollResolver } from '../interfaces/engine-interfaces'
export class HeroRollResolver implements IRollResolver {
  constructor(private rollReq: number) {}

  resolve(finalRoll: number): RollResult {
    return finalRoll >= this.rollReq ? RollResult.Success : RollResult.Failure
  }
}

export class MonsterRollResolver implements IRollResolver {
  constructor(
    private rollLowerReq: number,
    private rollHigherReq: number,
    private mode: RollCompareMode = RollCompareMode.HighToWin,
  ) {}

  resolve(finalRoll: number): RollResult {
    if (this.mode === RollCompareMode.HighToWin) {
      return finalRoll >= this.rollHigherReq
        ? RollResult.Slay
        : finalRoll <= this.rollLowerReq
          ? RollResult.FightBack
          : RollResult.Miss
    } else {
      return finalRoll >= this.rollHigherReq
        ? RollResult.FightBack
        : finalRoll <= this.rollLowerReq
          ? RollResult.Slay
          : RollResult.Miss
    }
  }
}

export class ChallengeRollResolver implements IRollResolver {
  constructor(private challengerRoll: number) {}
  resolve(finalRoll: number): RollResult {
    return finalRoll > this.challengerRoll
      ? RollResult.ChallengerLoses
      : RollResult.ChallengerWins
  }
}
