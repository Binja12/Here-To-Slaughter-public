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

    // Out of hand FIRST, then snapshot. Snapshot timing decides scope (§3), and
    // the card leaving the hand is the one part of a play that a lost challenge
    // must NOT undo — a challenged card is spent either way. Taking the frame
    // after the removal is what makes that true without a single flag: the
    // snapshot rollback restores a hand that already lacks the card. Same shape
    // as PlayChallengeReaction burning the challenger's card.
    player.removeFromHand(this.cardId)
    this.emmiter.emit(
      GameEventFactory.cardRemovedFromHand(this.playerId, this.cardId),
    )

    const frameId = this.reactionManager.openFrame()

    // Everything from here on is inside the frame, so a lost challenge undoes
    // all of it: the hero never joined, and the roll it granted never happens.

    // addHero announces the arrival itself — membership cannot change silently.
    gs.getParty(this.playerId).addHero(this.cardId, this.emmiter, 'Played')

    // Playing a hero grants a roll on it. It is a queued action, not an inline
    // call, because a roll suspends on a modifier window and only the queue
    // knows how to pause and resume around that. It goes to the FRONT so it
    // resolves before anything the player queued behind this play, and it is
    // FREE — the action point was already spent on the play itself.
    // The queue lives on GameState, so this entry rides in the snapshot too and
    // a rollback un-grants the roll along with the hero.
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

    // Opened last: the window is what suspends the drain, so nothing above it
    // can be left half-done when TurnManager stops. ChallengeWindow owns
    // settlement — release on an unchallenged or won play, restore on a lost
    // one — and GameEngine resumes the drain on FrameResolved, which is when
    // the granted roll runs.
    this.reactionManager.openWindow(
      frameId,
      ReactionWindowType.Challenge,
      this.playerId,
      { cardId: this.cardId },
    )
  }
}
