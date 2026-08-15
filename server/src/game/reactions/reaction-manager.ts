import { ReactionWindowType } from 'shared'
import { GameState } from '../game-state'
import { IReaction, IReactionWindow } from '../interfaces'
import { GameEventEmitter } from '../events/game-event-emitter'
import { ModifierWindow } from './modifier-window'
import { ChallengeWindow } from './challenge-window'
import { PlayerChoiceWindow } from './player-choice-window'
import { CardChoiceWindow } from './card-choice-window'
import { TaskChoiceWindow } from './task-choice-window'

export class ReactionManager {
  /** Set inside openFrame(); consumed by AbilityProcessor after each task step. */
  private _lastFrameId: string | null = null

  constructor(
    private readonly gs: GameState,
    private readonly em: GameEventEmitter,
  ) {}

  // ---------------------------------------------------------------------------
  // Frame API
  // ---------------------------------------------------------------------------

  /**
   * Snapshots GS and inserts an empty frame. Returns the frameId.
   * AbilityProcessor reads _lastFrameId after each step to decide
   * whether to suspend the pipeline.
   */
  openFrame(): string {
    const frameId = crypto.randomUUID()
    const snapshot = this.gs.clone()
    this.gs.addFrame(frameId, { snapshot, windows: [] })
    this._lastFrameId = frameId
    return frameId
  }

  /** Builds a reaction window and inserts it into the given frame. */
  openWindow(
    frameId: string,
    type: ReactionWindowType,
    respondent: string,
    config: Record<string, unknown> = {},
  ): void {
    const frame = this.gs.frames.get(frameId)
    if (!frame) return
    frame.windows.push(this.buildWindow(type, respondent, config, frameId))
  }

  /** Consumed by AbilityProcessor after each task step. */
  takeLastFrameId(): string | null {
    const id = this._lastFrameId
    this._lastFrameId = null
    return id
  }

  // ---------------------------------------------------------------------------
  // Window factory — settlement logic lives in each window class.
  // ---------------------------------------------------------------------------

  private buildWindow(
    type: ReactionWindowType,
    respondent: string,
    config: Record<string, unknown>,
    frameId: string,
  ): IReactionWindow {
    if (type === ReactionWindowType.Modifier) {
      return new ModifierWindow(
        crypto.randomUUID(),
        respondent,
        config['baseRoll'] as number,
        config['rollReq'] as number,
        config['heroId'] as string,
        5000,
        this.gs,
        frameId,
        this.em,
      )
    }

    if (type === ReactionWindowType.Challenge) {
      return new ChallengeWindow(
        crypto.randomUUID(),
        respondent,
        config['cardId'] as string,
        5000,
        this.gs,
        frameId,
        this.em,
      )
    }

    if (type === ReactionWindowType.PlayerChoice) {
      return new PlayerChoiceWindow(
        crypto.randomUUID(),
        respondent,
        (config['options'] as string[]) ?? [],
        5000,
        this.gs,
        frameId,
        this.em,
      )
    }

    if (type === ReactionWindowType.CardChoice) {
      return new CardChoiceWindow(
        crypto.randomUUID(),
        respondent,
        (config['options'] as string[]) ?? [],
        5000,
        this.gs,
        frameId,
        this.em,
      )
    }

    if (type === ReactionWindowType.TaskChoice) {
      return new TaskChoiceWindow(
        crypto.randomUUID(),
        respondent,
        5000,
        this.gs,
        frameId,
        this.em,
      )
    }

    // Exhaustive: adding a ReactionWindowType without a branch above is a
    // compile error here, rather than a window that never resolves and
    // silently stalls the turn drain.
    const unhandled: never = type
    throw new Error(`No window implementation for reaction type ${unhandled}`)
  }

  // ---------------------------------------------------------------------------
  // Reaction input — single entry point for all player reactions.
  // ---------------------------------------------------------------------------

  submitReaction(reaction: IReaction): void {
    if (!reaction.canExecute(this.gs)) return
    reaction.execute(this.gs, this.em)
  }
}
