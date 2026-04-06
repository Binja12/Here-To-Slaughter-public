import {
  ActionType,
  Audience,
  CardType,
  GameEventType,
  IGameEvent,
} from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../game-state'
import { GameEvent } from '../game-event'
import { ReactionManager } from '../reactions/reaction-manager'

const COST = 1

export class PlayCardAction implements IAction {
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
    return ActionType.PlayCard
  }

  getPlayerId(): string {
    return this.playerId
  }

  getCost(): number {
    return COST
  }

  isChallengeable(): boolean {
    // The card play itself can be challenged; the cost is spent regardless.
    return true
  }

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player) return false
    if (player.getActionPoints() < COST) return false
    if (!player.getHand().includes(this.cardId)) return false
    // No need to check gs.getCard() — hand membership is the authoritative source.
    return true
  }

  execute(gs: GameState): IGameEvent[] {
    const player = gs.getPlayer(this.playerId)!
    player.decreaseActionPoints(COST)
    // Remove from hand immediately — the cost is paid whether or not the
    // challenge succeeds.  The card will be placed (or discarded) when the
    // challenge window resolves.
    player.removeFromHand(this.cardId)

    const card = gs.getCard(this.cardId)

    // Build the deferred card-play logic that executes only if unchallenged.
    const onSuccess = (): IGameEvent[] => {
      if (!card) return []
      if (card.getType() === CardType.Hero) {
        gs.getParty(this.playerId).addHero(this.cardId)
        return [
          new GameEvent(
            GameEventType.HeroAddedToParty,
            this.playerId,
            { cardId: this.cardId },
            Audience.All,
          ),
        ]
      }
      // Item / Magic: one-time effects — full resolution deferred
      return [
        new GameEvent(
          GameEventType.CardPlayed,
          this.playerId,
          { cardId: this.cardId },
          Audience.All,
        ),
      ]
    }

    // Announce the attempt and open the 5 s challenge window.
    const attemptEvent = new GameEvent(
      GameEventType.CardPlayAttempted,
      this.playerId,
      { cardId: this.cardId },
      Audience.All,
    )

    // this.reactionManager.openChallengeWindow({
    //   challengedId: this.playerId,
    //   cardId: this.cardId,
    //   onSuccess,
    // })

    return [attemptEvent]
  }
}
