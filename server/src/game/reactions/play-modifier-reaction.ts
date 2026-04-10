import { IGameEventEmitter, ReactionType, ReactionWindowType } from 'shared'
import { IReaction } from '../interfaces'
import { GameState } from '../game-state'
import { GameEventFactory } from '../events/game-event-factory'

export class PlayModifierReaction implements IReaction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    private readonly value: number,
    private readonly targetPlayerId: string,
  ) {}

  getId(): string {
    return this.id
  }
  getType(): ReactionType {
    return ReactionType.ApplyModifier
  }
  getPlayerId(): string {
    return this.playerId
  }

  canExecute(gs: GameState): boolean {
    if (!gs.getFrameByWindowType(ReactionWindowType.Modifier)) return false
    if (!gs.getPlayer(this.playerId)?.getHand().includes(this.cardId))
      return false
    return true
  }

  execute(gs: GameState, em: IGameEventEmitter): void {
    const entry = gs.getFrameByWindowType(ReactionWindowType.Modifier)
    if (!entry) return
    gs.burnCard(entry.frameId, this.playerId, this.cardId)
    entry.frame.windows
      .find((w) => w.getType() === ReactionWindowType.Modifier)
      ?.submitReaction(this.playerId, {
        value: this.value,
        targetPlayerId: this.targetPlayerId,
      })
  }
}
