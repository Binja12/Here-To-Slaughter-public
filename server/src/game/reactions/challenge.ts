import { ActionType, IGameEvent, ReactionWindowType } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { ReactionManager } from './reaction-manager'
import { StartChallengeReaction } from './start-challenge-reaction'

const COST = 0

/**
 * A challenge action played by an opponent during a ChallengeWindow.
 * Cost is 0; it can be played outside the active player's turn.
 * Routes through ReactionManager.submitReaction(), NOT TurnManager.
 */
export class ChallengeCardAction implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    /** The challenger's own challenge card to spend. */
    private readonly cardId: string,
    /** The card that is being challenged (must have an open window). */
    private readonly targetedCardId: string,
    private readonly reactionManager: ReactionManager,
  ) {}

  getId(): string { return this.id }
  getType(): ActionType { return ActionType.Challenge }
  getPlayerId(): string { return this.playerId }
  getCost(): number { return COST }

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player?.getHand().includes(this.cardId)) return false
    if (gs.getCardsChallengedThisTurn().includes(this.targetedCardId)) return false
    return !!gs.getFrameByWindowType(ReactionWindowType.Challenge)
  }

  execute(gs: GameState): IGameEvent[] {
    this.reactionManager.submitReaction(
      new StartChallengeReaction(this.id, this.playerId, this.cardId, this.targetedCardId),
    )
    return []
  }
}
