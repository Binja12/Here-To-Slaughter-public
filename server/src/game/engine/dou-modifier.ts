import { roll2Dice } from 'src/utils/roll-utils'
import { IModifierWindow } from './engine-interfaces'

export class DouModifier implements IModifierWindow {
  private challengerRoll: number
  private challengedRoll: number
  private currRollValue: number
  private usedCardIds: string[] = []

  constructor() {
    this.challengerRoll = roll2Dice()
    this.challengedRoll = roll2Dice()
    this.currRollValue = this.challengedRoll - this.challengerRoll
  }

  applyModifier(value: number): void {
    this.currRollValue += value
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
