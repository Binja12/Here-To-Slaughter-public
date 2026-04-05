import {
  ActionType,
  Audience,
  CardType,
  GameEventType,
  IGameEvent,
} from 'shared'
import { IAction, IChallengeable } from '../interfaces'
import { GameState } from '../game-state'
import { GameEvent } from '../game-event'

const COST = 1

export class PlayCardAction implements IAction, IChallengeable {
  constructor(
    private playerId: string,
    private cardId: string,
  ) {}

  getId(): string {
    return `play-card-${this.cardId}-${Date.now()}`
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
    return true
  }

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player) return false
    if (!player.getHand().includes(this.cardId)) return false
    if (!gs.getCard(this.cardId)) return false
    return true
  }

  execute(gs: GameState): IGameEvent[] {
    const card = gs.getCard(this.cardId)
    if (!card) return []

    gs.getPlayer(this.playerId)!.removeFromHand(this.cardId)

    if (card.getType() === CardType.Hero) {
      gs.getParty(this.playerId).addHero(this.cardId)
      return [
        new GameEvent(
          GameEventType.HeroAdded,
          this.playerId,
          { cardId: this.cardId },
          Audience.All,
        ),
      ]
    }

    // Item and Magic: played as one-time effects (full logic deferred)
    return [
      new GameEvent(
        GameEventType.CardPlayed,
        this.playerId,
        { cardId: this.cardId },
        Audience.All,
      ),
    ]
  }
}
