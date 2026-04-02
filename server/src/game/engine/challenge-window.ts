import { CardType, ReactionWindowType } from 'shared'
import { DouModifier } from './dou-modifier'
import { IChallengeWindow, IModifierWindow } from './engine-interfaces'
import { GameState } from './game-state'

export class ChallengeWindow implements IChallengeWindow {
  private douModifier?: DouModifier
  private resolved: boolean = false
  private challengerWon: boolean = false
  private usedCardIds: string[] = []
  private challengerId?: string
  private lastActivityAt: number
  private modifierTimer?: NodeJS.Timeout

  constructor(
    private challengedId: string,
    private challengedCardId: string,
    private timeoutMs: number,
    private gs: GameState,
    private onResolved: () => void,
  ) {
    this.lastActivityAt = Date.now()
  }

  addResponse(playerId: string, cardId: string): void {
    this.usedCardIds.push(cardId)
    this.lastActivityAt = Date.now()

    const card = this.gs.getCardRepo().getById(cardId)
    if (card?.type === CardType.Challenge) {
      this.challengerId = playerId
      this.douModifier = new DouModifier(this.timeoutMs, (finalRoll) => {
        this.resolve(this.gs) // finalRoll already inside douModifier
        this.onResolved()
      })
    }
  }

  applyModifier(value: number, cardId: string): void {
    if (!this.douModifier) return
    this.douModifier.applyModifier(value)
    this.douModifier.addUsedCard(cardId)
    this.lastActivityAt = Date.now()
    this.startModifierTimer() // reset timer
  }

  private startModifierTimer(): void {
    if (this.modifierTimer) clearTimeout(this.modifierTimer)
    this.modifierTimer = setTimeout(() => {
      this.resolve(this.gs)
      this.onResolved()
    }, this.timeoutMs)
  }

  resolve(gs: GameState): void {
    if (this.resolved) return

    const allUsedCards = [
      ...this.usedCardIds,
      ...(this.douModifier?.getUsedCardIds() ?? []),
    ]

    allUsedCards.forEach((id) => {
      if (!gs.getDiscardPile().getAll().includes(id)) {
        gs.getDiscardPile().add(id)
      }
    })

    if (this.douModifier) {
      this.challengerWon = this.douModifier.getFinalRoll() <= 0
    }

    if (this.challengerWon) {
      gs.getDiscardPile().add(this.challengedCardId)
      gs.getPlayer(this.challengedId)!.removeFromHand(this.challengedCardId)
    }

    this.resolved = true
  }

  // ── IChallengeWindow ────────────────────────────────────────

  getChallengerId(): string {
    return this.challengerId ?? ''
  }
  getChallengedId(): string {
    return this.challengedId
  }
  didChallengerWin(): boolean {
    return this.challengerWon
  }

  getModifierWindow(): IModifierWindow {
    return this.douModifier!
  }

  // ── IReactionWindow ─────────────────────────────────────────

  getType(): ReactionWindowType {
    return ReactionWindowType.Challenge
  }
  isResolved(): boolean {
    return this.resolved
  }
  getTimeoutMs(): number {
    return this.timeoutMs
  }
  getLastActivityAt(): number {
    return this.lastActivityAt
  }
}
