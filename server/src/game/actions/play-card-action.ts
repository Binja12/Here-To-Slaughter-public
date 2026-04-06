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

const COST = 1

export class PlayCardAction implements IAction {
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
    player.removeFromHand(this.cardId)

    const card = gs.getCard(this.cardId)

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
      return [
        new GameEvent(
          GameEventType.CardPlayed,
          this.playerId,
          { cardId: this.cardId },
          Audience.All,
        ),
      ]
    }

    const onChallengeLost = (): void => {
      gs.getDiscardPile().add(this.cardId)
    }

    this.reactionManager.openChallengeWindow({
      defenderId: this.playerId,
      cardId: this.cardId,
      onSuccess,
      onChallengeLost,
    })

    return [
      new GameEvent(
        GameEventType.CardPlayAttempted,
        this.playerId,
        { cardId: this.cardId },
        Audience.All,
      ),
    ]
  }
}
