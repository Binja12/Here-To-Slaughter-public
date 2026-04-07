import {
  ActionType,
  Audience,
  CardType,
  GameEventType,
  IGameEvent,
  RollResult,
} from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { GameEvent } from '../events/game-event'
import { ReactionManager } from '../reactions/reaction-manager'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventFactory } from '../events/game-event-factory'
import { MonsterCard } from '../cards/monster-card'

const COST = 2

export class AttackMonsterAction implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    private readonly reactionManager: ReactionManager,
    private readonly emmiter: GameEventEmitter,
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

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player) return false
    if (gs.getCurrentPlayerId() !== this.playerId) return false
    if (player.getActionPoints() < COST) return false
    if (!gs.getMonsterPile().getAll().includes(this.cardId)) return false
    return true
  }

  execute(gs: GameState): void {
    const player = gs.getPlayer(this.playerId)!
    player.decreaseActionPoints(COST)
    const baseRoll = Math.ceil(Math.random() * 11) + 1
    const rollResult = (gs.getCard(this.cardId) as MonsterCard).trySlay(
      baseRoll,
    )
    if (rollResult == RollResult.Slay) {
      gs.getMonsterPile().pick(this.cardId)
      gs.getParty(this.playerId).addMonster(this.cardId)
      this.emmiter.emit(
        GameEventFactory.monsterSlain(this.playerId, this.cardId),
      )
    }
    if (rollResult == RollResult.FightBack) {
      //later implement
    }
  }
}
