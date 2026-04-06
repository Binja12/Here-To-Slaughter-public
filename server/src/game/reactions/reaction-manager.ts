import { ReactionWindowType } from 'shared'
import { GameState } from '../game-state'
import { IReactionWindow, IReactionAction } from '../interfaces'
import { GameEventEmitter } from '../game-event-emitter'
import { ModifierWindow } from './modifier-window'

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

  submitReaction(windowId: string, playerId: string, payload: unknown): void {
    this.windows.get(windowId)?.submitReaction(playerId, payload)
  }

  getWindowByType(type: ReactionWindowType): IReactionWindow | undefined {
    for (const w of this.windows.values()) {
      if (w.isOpen() && w.getType() === type) return w
    }
    return undefined
  }
}
