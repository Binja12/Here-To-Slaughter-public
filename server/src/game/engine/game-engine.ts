import { GameConfig } from './game-config'
import { GameState } from './game-state'
import { TurnManager } from './turn-manager'
import { ReactionManager } from './reaction-manager'
import { IGameEvent, IWinCondition } from './engine-interfaces'
import { Player } from '../player'
import { Party } from '../party'
import { GamePhase, ICardRepository } from 'shared'
import { ActionType, CardType } from 'shared'
import { ModifierCardData } from 'shared'
import { SlayMonsters } from './win-conditions'
import { AllClassesInParty } from './win-conditions'
import { DrawCardAction } from '../actions/draw-card-action'
import { PlayHeroAction } from '../actions/play-hero-action'
import { PlayItemAction } from '../actions/play-item-action'
import { PlayMagicAction } from '../actions/play-magic-action'
import { AttackMonsterAction } from '../actions/attack-monster-action'
import { ResetHandAction } from '../actions/reset-hand-action'
import { ChallengeWindow } from './challenge-window'
import { ModifierWindow } from './modifier-window'
import { GameEvent } from './game-event'
import { GameEventType } from 'shared'

export class GameEngine {
  private gs: GameState
  private tm: TurnManager
  private rm: ReactionManager
  private winConditions: IWinCondition[]

  constructor(
    config: GameConfig,
    players: Player[],
    parties: Party[],
    cardRepo: ICardRepository,
    private socketEmit: (events: IGameEvent[]) => void,
  ) {
    this.gs = new GameState(config, players, parties, cardRepo)
    this.rm = new ReactionManager(this.gs)
    this.tm = new TurnManager(
      this.gs,
      this.rm,
      (events) => this.handleEvents(events),
      config.flawPlay,
    )
    this.winConditions = [
      new SlayMonsters(
        config.winConditions.find((w) => w.type === 'SlayMonsters')?.value ?? 3,
      ),
      new AllClassesInParty(cardRepo),
    ]
  }

  // ── Game lifecycle ──────────────────────────────────────────

  startGame(): void {
    // TODO: setup decks, deal cards, flip monsters
    this.gs.setPhase(GamePhase.Playthrough)
    this.tm.startTurn(this.gs.getPlayers()[0].getId())
  }

  // ── Player action ───────────────────────────────────────────

  onPlayerAction(
    playerId: string,
    actionType: ActionType,
    payload: unknown,
  ): void {
    const action = this.createAction(playerId, actionType, payload)
    this.tm.submitAction(action)
  }

  // ── Player reaction ─────────────────────────────────────────

  onPlayerReaction(
    playerId: string,
    cardId: string,
    valueIndex?: number,
  ): void {
    this.rm.handleReaction(playerId, cardId, valueIndex)
  }

  // ── Events ──────────────────────────────────────────────────

  private handleEvents(events: IGameEvent[]): void {
    // check win conditions
    for (const condition of this.winConditions) {
      const winner = condition.check(this.gs)
      if (winner) {
        this.gs.setWinner(winner.getId())
        events.push(new GameEvent(GameEventType.GameEnded, winner.getId()))
        break
      }
    }

    // broadcast to all players
    this.socketEmit(events)
  }

  // ── Action factory ──────────────────────────────────────────

  private createAction(
    playerId: string,
    actionType: ActionType,
    payload: unknown,
  ) {
    const p = payload as Record<string, string>
    switch (actionType) {
      case ActionType.DrawCard:
        return new DrawCardAction(playerId)
      case ActionType.PlayHero:
        return new PlayHeroAction(playerId, p.cardId)
      case ActionType.PlayItem:
        return new PlayItemAction(playerId, p.cardId, p.targetHeroId)
      case ActionType.PlayMagic:
        return new PlayMagicAction(playerId, p.cardId)
      case ActionType.AttackMonster:
        return new AttackMonsterAction(playerId, p.monsterId)
      case ActionType.ResetHand:
        return new ResetHandAction(playerId)
      default:
        throw new Error(`Unknown action type: ${actionType}`)
    }
  }

  // ── Getters ─────────────────────────────────────────────────

  getGameState(): GameState {
    return this.gs
  }
}
