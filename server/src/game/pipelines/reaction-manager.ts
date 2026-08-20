import { ReactionWindowType } from 'shared'
import type { ValueBias } from '../interfaces'
import { GameState } from './game-state'
import { IReaction, IReactionManager, IReactionWindow } from '../interfaces'
import { GameEventEmitter } from '../events/game-event-emitter'
import { ModifierWindow } from '../reactions/modifier-window'
import { ChallengeWindow } from '../reactions/challenge-window'
import { PlayerChoiceWindow } from '../reactions/player-choice-window'
import { CardChoiceWindow } from '../reactions/card-choice-window'
import { ValueChoiceWindow } from '../reactions/value-choice-window'
import { TaskChoiceWindow } from '../reactions/task-choice-window'

export class ReactionManager implements IReactionManager {
  constructor(
    private readonly gs: GameState,
    private readonly em: GameEventEmitter,
  ) {}

  // ---------------------------------------------------------------------------
  // Frame API
  // ---------------------------------------------------------------------------

  /**
   * Snapshots GS and inserts an empty frame. Returns the frameId — the caller
   * owns it from here: a task hands it back from `execute` so the processor can
   * suspend, an action simply keeps it to open its window with.
   */
  openFrame(): string {
    const frameId = crypto.randomUUID()
    const snapshot = this.gs.clone()
    this.gs.addFrame(frameId, { snapshot, windows: [] })
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

    if (type === ReactionWindowType.ValueChoice) {
      return new ValueChoiceWindow(
        crypto.randomUUID(),
        respondent,
        (config['options'] as number[]) ?? [],
        // SHORTER than a roll's. This window opens over a roll that is already
        // running and is a question ABOUT it, so it has to settle first — with
        // the same 5s both would fall due on the same tick and the roll, whose
        // timer was reset first, would win and settle without the bonus.
        3000,
        this.gs,
        frameId,
        this.em,
        (config['bias'] as ValueBias) ?? 'highest',
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
        config,
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
