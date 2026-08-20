import { ActionType } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { AttackMonster } from '../tasks/attack-monster-task'
import { ReactionManager } from '../pipelines/reaction-manager'
import { GameEventEmitter } from '../events/game-event-emitter'

const COST = 2

// ---------------------------------------------------------------------------
// The player-request half of attacking a monster. The mechanic is
// AttackMonster, in `tasks/attack-monster-task.ts`, shared with
// AttackMonsterTask (§1); this adds the cost, the guards and a queue identity.
//
// The frameId is dropped: an action has no pipeline, and TurnManager's drain
// already stops on the open window.
// ---------------------------------------------------------------------------

export class AttackMonsterAction extends AttackMonster implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    private readonly reactionManager: ReactionManager,
    private readonly emmiter: GameEventEmitter,
  ) {
    super()
  }

  getId(): string { return this.id }
  getPlayerId(): string { return this.playerId }
  getType(): ActionType { return ActionType.AttackMonster }
  getCost(): number { return COST }
  isReactable(): boolean { return true }

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player) return false
    if (gs.getCurrentPlayerId() !== this.playerId) return false
    if (player.getActionPoints() < COST) return false
    if (!gs.getMonsterPile().getAll().includes(this.cardId)) return false
    return true
  }

  execute(gs: GameState): void {
    // Spent before the frame opens, so a failed attack still costs the points.
    gs.getPlayer(this.playerId)!.decreaseActionPoints(COST)
    this.attackMonster(
      gs,
      this.playerId,
      this.cardId,
      this.emmiter,
      this.reactionManager,
    )
  }
}
