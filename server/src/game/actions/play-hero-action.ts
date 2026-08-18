import { ActionType, ReactionWindowType } from 'shared'
import { IAction, IActionQueue } from '../interfaces'
import { GameState } from '../game-state'
import { ReactionManager } from '../reactions/reaction-manager'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventFactory } from '../events/game-event-factory'
import { FREE, RollOnHeroAction } from './roll-on-hero-action'

const COST = 1

export class PlayHeroAction implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    private readonly reactionManager: ReactionManager,
    private readonly emmiter: GameEventEmitter,
    private readonly actionQueue: IActionQueue,
  ) {}

  getId(): string {
    return this.id
  }

  getType(): ActionType {
    return ActionType.PlayHero
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
    if (!player.getHand().includes(this.cardId)) return false
    return true
  }

  execute(gs: GameState): void {
    const player = gs.getPlayer(this.playerId)!
    player.decreaseActionPoints(COST)

    // Out of hand BEFORE the snapshot: a challenged card is spent either way,
    // so a lost challenge must not restore it to hand. ChallengeWindow puts it
    // in the discard when the challenger wins.
    player.removeFromHand(this.cardId)
    this.emmiter.emit(
      GameEventFactory.cardRemovedFromHand(this.playerId, this.cardId),
    )

    const frameId = this.reactionManager.openFrame()

    // Everything below is inside the frame, so a lost challenge undoes it all.

    // addHero announces the arrival itself.
    gs.getParty(this.playerId).addHero(this.cardId, this.emmiter, 'Played')

    // Queued rather than called inline: a roll suspends on a modifier window,
    // and only the queue can pause and resume around that. FREE — the point
    // was spent on the play. The queue lives on GameState, so a rollback
    // un-grants this along with the hero.
    this.actionQueue.enqueueFirst(
      new RollOnHeroAction(
        crypto.randomUUID(),
        this.playerId,
        this.cardId,
        this.emmiter,
        this.reactionManager,
        FREE,
      ),
    )

    // Last: this window suspends the drain. ChallengeWindow owns settlement,
    // and GameEngine resumes the drain on FrameResolved.
    this.reactionManager.openWindow(
      frameId,
      ReactionWindowType.Challenge,
      this.playerId,
      { cardId: this.cardId },
    )
  }
}
