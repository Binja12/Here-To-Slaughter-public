import { GameState } from './game-state'
import { IChallengeWindow, IModifierWindow } from './engine-interfaces'
import { CardType, ModifierCardData } from 'shared'

export class ReactionManager {
  private challengeWindow?: IChallengeWindow
  private modifierWindow?: IModifierWindow

  constructor(private gs: GameState) {}

  // ── Window setters ──────────────────────────────────────────

  setChallengeWindow(window: IChallengeWindow): void {
    this.challengeWindow = window
  }

  setModifierWindow(window: IModifierWindow): void {
    this.modifierWindow = window
  }

  // ── Route reactions ─────────────────────────────────────────

  handleReaction(playerId: string, cardId: string, valueIndex?: number): void {
    const card = this.gs.getCardRepo().getById(cardId)
    if (!card) return

    if (card.type === CardType.Challenge) {
      this.challengeWindow?.addResponse(playerId, cardId)
      return
    }

    if (card.type === CardType.Modifier) {
      const modCard = card as ModifierCardData
      const value = modCard.values[valueIndex ?? 0]

      // modifier during challenge
      if (this.challengeWindow && !this.challengeWindow.isResolved()) {
        this.challengeWindow.applyModifier(value, cardId)
        return
      }

      // modifier during action roll
      if (this.modifierWindow) {
        this.modifierWindow.applyModifier(value)
        this.modifierWindow.addUsedCard(cardId)
      }
    }
  }

  // ── Getters ─────────────────────────────────────────────────

  getChallengeWindow(): IChallengeWindow | undefined {
    return this.challengeWindow
  }
  getModifierWindow(): IModifierWindow | undefined {
    return this.modifierWindow
  }

  hasOpenWindow(): boolean {
    return (
      (!!this.challengeWindow && !this.challengeWindow.isResolved()) ||
      !!this.modifierWindow
    )
  }

  clearChallengeWindow(): void {
    this.challengeWindow = undefined
  }
  clearModifierWindow(): void {
    this.modifierWindow = undefined
  }
}
