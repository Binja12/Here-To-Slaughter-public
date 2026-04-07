import {
  ActionType,
  Audience,
  CardType,
  GameEventType,
  IGameEvent,
} from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { GameEvent } from '../events/game-event'
import { ReactionManager } from '../reactions/reaction-manager'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventFactory } from '../events/game-event-factory'
import { AbilityProcessor } from '../ability-processor'
import { MagicCard } from '../cards/magic-card'
import { ItemCard } from '../cards/item-card'
import { HeroCard } from '../cards/hero-card'

const COST = 1

export class PlayItemAction implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    private readonly targetHeroId: string,
    private readonly reactionManager: ReactionManager,
    private readonly emmiter: GameEventEmitter,
  ) {}

  getId(): string {
    return this.id
  }

  getType(): ActionType {
    return ActionType.PlayItem
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
    if (!player.getHand().includes(this.cardId)) return false
    if (gs.getCard(this.targetHeroId)?.getType() !== CardType.Hero) return false

    const itemCard = gs.getCard(this.cardId) as ItemCard
    const targetOwnerId = gs.getCardOwner(this.targetHeroId)
    if (!targetOwnerId) return false

    if (!itemCard.isCursed() && targetOwnerId !== this.playerId) return false

    return true
  }

  execute(gs: GameState): void {
    const player = gs.getPlayer(this.playerId)!
    player.decreaseActionPoints(COST)
    player.removeFromHand(this.cardId)
    this.emmiter.emit(
      GameEventFactory.cardRemovedFromHand(this.playerId, this.cardId),
    )
    const card = gs.getCard(this.targetHeroId) as HeroCard
    card.equipItem(this.cardId)
    this.emmiter.emit(
      GameEventFactory.itemEquipedToHero(
        this.playerId,
        this.cardId,
        this.targetHeroId,
      ),
    )
  }
}
