import { ReactionWindowType } from 'shared'
import { GameState } from '../game-state'
import { IReactionWindow } from '../interfaces'

/**
 * Pure registry for reaction windows.
 *
 * Responsibilities:
 *   - registerWindow   → stores window + syncs to GameState for TurnManager queries
 *   - unregisterWindow → removes window + syncs to GameState + calls onWindowClosed
 *   - submitReaction   → routes a player reaction payload to the correct open window
 *   - getWindowByType  → lookup helper for actions that need to target an open window
 *
 * Must NOT: roll dice, mutate GameState, decide outcomes, know about abilities or cards.
 */
export class ReactionManager {
  private windows: Map<string, IReactionWindow> = new Map()

  constructor(
    private readonly gs: GameState,
    /** Called each time a window fully closes — used to resume TurnManager drain. */
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

  submitReaction(windowId: string, playerId: string, payload: unknown): void {
    this.windows.get(windowId)?.submitReaction(playerId, payload)
  }

  /** Returns the first open window of the given type, or undefined. */
  getWindowByType(type: ReactionWindowType): IReactionWindow | undefined {
    for (const w of this.windows.values()) {
      if (w.isOpen() && w.getType() === type) return w
    }
    return undefined
  }
}
