import { IModifierWindow } from '../interfaces/engine-interfaces'
import { roll2Dice } from '../../../utils/roll-utils'

export class ModifierWindow implements IModifierWindow {
  private roll: number
  private usedCardIds: string[] = []
  private timer: NodeJS.Timeout

  constructor(
    private playerId: string,
    private timeoutMs: number,
    private onResolved: (finalRoll: number) => void,
  ) {
    this.roll = roll2Dice()
    this.timer = setTimeout(() => {
      this.onResolved(this.getFinalRoll())
    }, timeoutMs)
  }

  applyModifier(value: number): void {
    this.roll += value
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.onResolved(this.getFinalRoll())
    }, this.timeoutMs)
  }

  getFinalRoll(): number {
    return this.roll
  }
  getRolls(): number[] {
    return [this.roll]
  }
  getUsedCardIds(): string[] {
    return this.usedCardIds
  }
  addUsedCard(cardId: string): void {
    this.usedCardIds.push(cardId)
  }
  getPlayerId(): string {
    return this.playerId
  }
}
