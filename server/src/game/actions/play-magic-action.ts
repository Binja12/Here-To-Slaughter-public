import { ActionType } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { ReactionManager } from '../reactions/reaction-manager'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventFactory } from '../events/game-event-factory'

const COST = 1

export class PlayMagicAction implements IAction {
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
    return ActionType.PlayMagic
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
    return true
  }

  execute(gs: GameState): void {
    const player = gs.getPlayer(this.playerId)!
    player.decreaseActionPoints(COST)

    // Move card from hand to party instance pile
    player.removeFromHand(this.cardId)
    this.emmiter.emit(
      GameEventFactory.cardRemovedFromHand(this.playerId, this.cardId),
    )

    const party = gs.getParty(this.playerId)
    party.addInstanceCard(this.cardId)

    // Emit MagicPlayed — AbilityProcessor picks this up via onEvent(),
    // finds the card in instance sources, and executes its ability synchronously.
    this.emmiter.emit(GameEventFactory.magicPlayed(this.playerId, this.cardId))

    // Resolve: remove from instance, move to discard
    party.removeInstanceCard(this.cardId)
    gs.getDiscardPile().add(this.cardId)
    this.emmiter.emit(
      GameEventFactory.cardDiscarded(this.playerId, this.cardId),
    )
  }
}
