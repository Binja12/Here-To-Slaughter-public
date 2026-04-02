import { CardType } from 'shared'
import { DouModifier } from './dou-modifier'
import { IChallengeWindow } from './engine-interfaces'
import { GameState } from './game-state'

export class ChallengeWindow implements IChallengeWindow {
  private douModifier?: DouModifier
  private resolved: boolean = false
  private challengerWon: boolean = false
  private usedCardIds: string[] = []
  private challengerId?: string
  private lastActivityAt: number

  constructor(
    private challengedId: string,
    private challengedCardId: string,
    private timeoutMs: number,
  ) {
    this.lastActivityAt = Date.now()
  }

  // called when challenge card is played
  startResolution(challengerId: string): void {
    this.challengerId = challengerId
    this.douModifier = new DouModifier() // auto rolls both dice
  }

  // called when modifier card is played
  handleModifier(value: number, cardId: string): void {
    if (!this.douModifier) return
    this.douModifier.applyModifier(value)
    this.douModifier.addUsedCard(cardId)
    this.lastActivityAt = Date.now()
  }

  resolve(gs: GameState): void {
    const allUsedCards = [
      ...this.usedCardIds,
      ...(this.douModifier?.getUsedCardIds() ?? []),
    ]

    // re-discard all used cards
    allUsedCards.forEach((id) => {
      if (!gs.getDiscardPile().getAll().includes(id)) {
        gs.getDiscardPile().add(id)
      }
    })

    if (this.douModifier) {
      // currRollValue > 0 → challenged wins, <= 0 → challenger wins
      this.challengerWon = this.douModifier.getFinalRoll() <= 0
    }

    if (this.challengerWon) {
      gs.getDiscardPile().add(this.challengedCardId)
      gs.getPlayer(this.challengedId)!.removeFromHand(this.challengedCardId)
    }

    this.resolved = true
  }

  handleReaction(playerId: string, cardId: string, gs: GameState): void {
    const card = gs.getCardRepo().getById(cardId)
    if (!card) return

    gs.getDiscardPile().add(cardId)
    gs.getPlayer(playerId)!.removeFromHand(cardId)
    this.usedCardIds.push(cardId)

    if (card.type === CardType.Challenge) {
      this.startResolution(playerId)
    }
  }

  // Getters
  getRolls(): number[] {
    return this.douModifier?.getRolls() ?? []
  }
  hasChallenge(): boolean {
    return this.challengerId !== undefined
  }
  getDouModifier(): DouModifier | undefined {
    return this.douModifier
  }
  isResolved(): boolean {
    return this.resolved
  }
  didChallengerWin(): boolean {
    return this.challengerWon
  }
  getLastActivityAt(): number {
    return this.lastActivityAt
  }
  getTimeoutMs(): number {
    return this.timeoutMs
  }
  getChallengerId(): string {
    return this.challengerId ?? ''
  }
  getChallengedId(): string {
    return this.challengedId
  }
}
