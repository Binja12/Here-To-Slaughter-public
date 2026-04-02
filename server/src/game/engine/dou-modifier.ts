import { IModifierWindow } from './engine-interfaces'
import { roll2Dice } from '../../utils/roll-utils'

export class DouModifier implements IModifierWindow {
  private challengerRoll: number
  private challengedRoll: number
  private currRollValue: number
  private usedCardIds: string[] = []
  private timer: NodeJS.Timeout

  constructor(
    private timeoutMs: number,
    private onResolved: (finalRoll: number) => void,
  ) {
    this.challengerRoll = roll2Dice()
    this.challengedRoll = roll2Dice()
    this.currRollValue = this.challengedRoll - this.challengerRoll
    this.timer = setTimeout(() => {
      this.onResolved(this.getFinalRoll())
    }, timeoutMs)
  }

  applyModifier(value: number): void {
    this.currRollValue += value
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.onResolved(this.getFinalRoll())
    }, this.timeoutMs)
  }

  getFinalRoll(): number {
    return this.currRollValue
  }
  getRolls(): number[] {
    return [this.challengerRoll, this.challengedRoll]
  }
  getUsedCardIds(): string[] {
    return this.usedCardIds
  }
  addUsedCard(cardId: string): void {
    this.usedCardIds.push(cardId)
  }
}
