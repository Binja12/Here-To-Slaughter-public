import {
  ActionType,
  Audience,
  CardType,
  GameEventType,
  IGameEvent,
  PassiveType,
  RollContext,
  RollResult,
} from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { GameEvent } from '../events/game-event'
import { ReactionManager } from '../pipelines/reaction-manager'
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
    const player = gs.getPlayer(this.playerId)!
    player.decreaseActionPoints(COST)
    const baseRoll = Math.ceil(Math.random() * 11) + 1
    // Standing bonuses for an ATTACK roll — the Divine Arrow (leader-116) is
    // the reference. No modifier window opens on an attack, so these are the
    // whole of what can move the number.
    const bonus = gs
      .getEffects(
        PassiveType.RollBonus,
        this.playerId,
        undefined,
        RollContext.Attack,
      )
      .reduce((sum, effect) => sum + (effect.value ?? 0), 0)
    const rollResult = (gs.getCard(this.cardId) as MonsterCard).trySlay(
      baseRoll + bonus,
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
