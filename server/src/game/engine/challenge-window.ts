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
  challengeTimer: any

  constructor(
    private challengedId: string,
    private challengedCardId: string,
    private timeoutMs: number,
    private gs: GameState,
    private onResolved: () => void,
  ) {
    this.lastActivityAt = Date.now()
    this.startChallengeTimer()
  }

  private startChallengeTimer(): void {
    if (this.challengeTimer) clearTimeout(this.challengeTimer)
    this.challengeTimer = setTimeout(() => {
      // nobody challenged — resolve with no winner
      this.resolve(this.gs)
      this.onResolved()
    }, this.timeoutMs)
  }

  addResponse(playerId: string, cardId: string): void {
    const newerGs = this.gs.clone()
    this.gs.restoreSnapshot()
    this.usedCardIds.push(cardId)
    this.lastActivityAt = Date.now()

    const card = this.gs.getCardRepo().getById(cardId)
    if (card?.type === CardType.Challenge) {
      if (this.challengeTimer) {
        clearTimeout(this.challengeTimer)
        this.challengeTimer = undefined
      }

      this.challengerId = playerId
      this.douModifier = new DouModifier(this.timeoutMs, () => {
        this.resolve(newerGs)
        this.onResolved()
      })
    }
  }

  applyModifier(value: number, cardId: string): void {
    if (!this.douModifier) return
    if (
      this.gs
        .getPlayers()
        .find((player) => player.getHand().includes(cardId))
        ?.getId() !== this.challengedId
    )
      value = value * -1
    this.douModifier.applyModifier(value)
    this.douModifier.addUsedCard(cardId)
    this.lastActivityAt = Date.now()
  }

  resolve(newerGs: GameState): void {
    if (this.resolved) return

    const allUsedCards = [
      ...this.usedCardIds,
      ...(this.douModifier?.getUsedCardIds() ?? []),
    ]

    if (this.douModifier) {
      this.challengerWon = this.douModifier.getFinalRoll() >= 0
    }
    if (this.challengerWon) {
      this.gs.getDiscardPile().add(this.challengedCardId)
      this.gs
        .getPlayer(this.challengedId)!
        .removeFromHand(this.challengedCardId)
      this.gs.getParty(this.challengedId)!.removeHero(this.challengedCardId)
    } else {
      this.gs.loadSnapshot(newerGs)
    }

    // discard used cards on final gs
    allUsedCards.forEach((id) => {
      if (!this.gs.getDiscardPile().getAll().includes(id)) {
        const player = this.gs
          .getPlayers()
          .find((player) => player.getHand().includes(id))

        if (player) {
          player.removeFromHand(id)
        }

        this.gs.getDiscardPile().add(id)
      }
    })
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
