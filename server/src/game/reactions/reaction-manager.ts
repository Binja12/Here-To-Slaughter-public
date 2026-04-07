import { ReactionWindowType } from 'shared'
import { GameState } from '../game-state'
import { IReactionWindow } from '../interfaces'
import { GameEventEmitter } from '../events/game-event-emitter'
import { ModifierWindow } from './modifier-window'
import { ChallengeWindow } from './challenge-window'

export class ReactionManager {
  private windows: Map<string, IReactionWindow> = new Map()

  constructor(
    private readonly gs: GameState,
    private readonly em: GameEventEmitter,
    private readonly onWindowClosed: () => void,
  ) {}

  registerWindow(window: IReactionWindow): void {
    this.windows.set(window.getId(), window)
    this.gs.addReactionWindow(window)
  }

  unregisterWindow(windowId: string): void {
    const w = this.windows.get(windowId)
    if (w) this.gs.removeReactionWindow(w)
    this.windows.delete(windowId)
    this.onWindowClosed()
  }

  openModifierWindow(
    rollerId: string,
    baseRoll: number,
    rollReq: number,
    heroId: string,
    onResolve: (finalRoll: number) => void,
  ): void {
    const id = crypto.randomUUID()

    const window = new ModifierWindow(
      id,
      rollerId,
      baseRoll,
      rollReq,
      heroId,
      5000,
      this.em,
      (finalRoll) => {
        onResolve(finalRoll)
        return []
      },
      () => this.unregisterWindow(id),
    )

    this.registerWindow(window)
  }

  openChallengeWindow(
    defenderId: string,
    cardId: string,
    onResolve: (defenderWins: boolean) => void,
  ): void {
    const id = crypto.randomUUID()

    const window = new ChallengeWindow(
      id,
      defenderId,
      cardId,
      5000,
      this.em,
      (defenderWins) => {
        onResolve(defenderWins)
      },
      () => this.unregisterWindow(id),
    )

    this.registerWindow(window)
  }

  /** Routes a challenge submission to the open ChallengeWindow. */
  startChallenge(challengerId: string): void {
    const window = this.getWindowByType(ReactionWindowType.Challenge) as
      | ChallengeWindow
      | undefined
    window?.submitReaction(challengerId, { type: 'challenge', challengerId })
  }

  /** Routes a modifier to the open ChallengeWindow or ModifierWindow. */
  applyModifier(
    playerId: string,
    value: number,
    targetPlayerId?: string,
  ): void {
    const challengeWindow = this.getWindowByType(
      ReactionWindowType.Challenge,
    ) as ChallengeWindow | undefined
    if (challengeWindow && targetPlayerId) {
      challengeWindow.submitReaction(playerId, {
        type: 'modifier',
        value,
        targetPlayerId,
      })
      return
    }

    const modifierWindow = this.getWindowByType(ReactionWindowType.Modifier) as
      | ModifierWindow
      | undefined
    modifierWindow?.submitReaction(playerId, { value })
  }

  submitReaction(windowId: string, playerId: string, payload: unknown): void {
    this.windows.get(windowId)?.submitReaction(playerId, payload)
  }

  getWindowByType(type: ReactionWindowType): IReactionWindow | undefined {
    for (const w of this.windows.values()) {
      if (w.getType() === type) return w
    }
    return undefined
  }
}
