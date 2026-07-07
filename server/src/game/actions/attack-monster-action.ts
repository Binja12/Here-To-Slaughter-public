import { ActionType, ReactionWindowType } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { ReactionManager } from '../reactions/reaction-manager'
import { AbilityContext } from '../ability-context'
import { MonsterAttackOutcomeTask } from '../tasks/tasks'

const COST = 2

export class AttackMonsterAction implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    private readonly reactionManager: ReactionManager,
  ) {}

  getId(): string {
    return this.id
  }

  getType(): ActionType {
    return ActionType.AttackMonster
  }

  getPlayerId(): string {
    return this.playerId
  }

  getCost(): number {
    return COST
  }
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
    gs.getPlayer(this.playerId)!.decreaseActionPoints(COST)
    const baseRoll = Math.floor(Math.random() * 11) + 1
    const frameId = this.reactionManager.openFrame()

    gs.abilityPipelines.set(frameId, {
      steps: [new MonsterAttackOutcomeTask(this.cardId, this.playerId)],
      ctx: new AbilityContext(this.cardId, this.playerId),
    })

    // No rollReq — monster attacks always release the frame; outcome is handled
    // by MonsterAttackOutcomeTask (Slay / Miss / FightBack).
    this.reactionManager.openWindow(frameId, ReactionWindowType.Modifier, this.playerId, {
      baseRoll,
      heroId: this.cardId,
    })

    this.reactionManager.takeLastFrameId()
  }
}
