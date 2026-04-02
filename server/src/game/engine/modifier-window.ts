import { ReactionWindowType } from 'shared'
import { IModifierWindow } from './engine-interfaces'
import { roll2Dice } from '../../utils/roll-utils'

type PlayerResponse = {
  playerId: string
  cardId: string
  timestamp: number
}

export class ModifierWindow implements IModifierWindow {
  private roll: number
  private resolved: boolean = false
  private lastActivityAt: number
  private responses: PlayerResponse[] = []
  private usedCardIds: string[] = []

  constructor(
    private playerId: string,
    private timeoutMs: number,
  ) {
    this.roll = roll2Dice()
    this.lastActivityAt = Date.now()
  }

  // ── IModifierWindow ─────────────────────────────────────────

  getPlayerId(): string {
    return this.playerId
  }
  getRoll(): number {
    return this.roll
  }
  getFinalRoll(): number {
    return this.roll
  }

  applyModifier(value: number): void {
    this.roll += value
    this.lastActivityAt = Date.now()
  }

  // ── IReactionWindow ─────────────────────────────────────────

  getType(): ReactionWindowType {
    return ReactionWindowType.Modifier
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

  resolve(): void {
    this.resolved = true
  }

  addResponse(playerId: string, cardId: string): void {
    this.responses.push({
      playerId,
      cardId,
      timestamp: Date.now(),
    })
    this.usedCardIds.push(cardId)
    this.lastActivityAt = Date.now()
  }

  // ── Extra ───────────────────────────────────────────────────

  getUsedCardIds(): string[] {
    return this.usedCardIds
  }
  getResponses(): PlayerResponse[] {
    return this.responses
  }
}
