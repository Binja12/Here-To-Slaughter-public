import { ActionType, CardType, IGameEvent, ReactionWindowType } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { ReactionManager } from './reaction-manager'
import { ModifierCard } from '../cards/modifier-card'

const COST = 0

/**
 * Played during a ModifierWindow (on any player's roll).
 * Cost is 0; usable outside the active player's turn.
 * Routes through ReactionManager.enqueueReaction(), NOT TurnManager.
 */
export class ApplyModifierAction implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    private readonly value: number,
    private readonly targetPlayerId: string | undefined, // undefined = ModifierWindow context
    private readonly reactionManager: ReactionManager,
  ) {}

  getId(): string {
    return this.id
  }

  getType(): ActionType {
    return ActionType.ApplyModifier
  }

  getPlayerId(): string {
    return this.playerId
  }

  getCost(): number {
    return COST
  }

  isChallengeable(): boolean {
    return false
  }

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player) return false
    if (!player.getHand().includes(this.cardId)) return false
    // Must be a modifier card.
    const card = gs.getCard(this.cardId)
    if (!card || card.getType() !== CardType.Modifier) return false
    // A modifier window must be open.
    if (!gs.getFrameByWindowType(ReactionWindowType.Modifier)) return false
    return true
  }

  execute(gs: GameState): IGameEvent[] {
    const player = gs.getPlayer(this.playerId)!
    const card = gs.getCard(this.cardId) as ModifierCard | undefined
    if (!card) return []

    // Track before spending — on rollback the snapshot restores the card to
    // hand, so RM will re-discard it after restoring.
    const frameEntry = gs.getFrameByWindowType(ReactionWindowType.Modifier)
    if (frameEntry) gs.trackCardSpent(frameEntry.frameId, this.cardId)

    player.removeFromHand(this.cardId)

    this.reactionManager.applyModifier(
      this.playerId,
      this.value,
      this.targetPlayerId,
    )

    return []
  }
}
