import { ReactionWindowType, RefusalReason, RequestResult } from 'shared'
import type { ValueBias } from '../interfaces'
import { GameState } from './game-state'
import {
  accepted,
  IReaction,
  IReactionManager,
  IReactionWindow,
  refused,
  isPassable,
} from '../interfaces'
import { GameEventEmitter } from '../events/game-event-emitter'
import { ModifierWindow } from '../reactions/modifier-window'
import { AttackWindow } from '../reactions/attack-window'
import { ChallengeWindow } from '../reactions/challenge-window'
import { PlayerChoiceWindow } from '../reactions/player-choice-window'
import { CardChoiceWindow } from '../reactions/card-choice-window'
import { MonsterChoiceWindow } from '../reactions/monster-choice-window'
import { ValueChoiceWindow } from '../reactions/value-choice-window'
import { TaskChoiceWindow } from '../reactions/task-choice-window'

/**
 * Each window's share of the configured reaction countdown.
 *
 * A share rather than a number, so one config value moves every window
 * together and the RELATIONSHIP between them survives. That relationship is
 * load-bearing: a ValueChoice opens over a roll that is already running and is
 * a question ABOUT it, so it has to settle first. Give both the same countdown
 * and they fall due on the same tick — the roll, whose timer was reset first,
 * wins and settles without the bonus.
 *
 * The two ZERO cases are not shares and are not here: an empty ChoiceWindow and
 * an unchallengeable ChallengeWindow settle on a 0ms timer whatever the
 * countdown is, because there is nothing to wait for.
 */
const WINDOW_SHARE: Readonly<Record<ReactionWindowType, number>> = {
  [ReactionWindowType.Modifier]: 1,
  [ReactionWindowType.Attack]: 1,
  [ReactionWindowType.Challenge]: 1,
  [ReactionWindowType.PlayerChoice]: 1,
  [ReactionWindowType.CardChoice]: 1,
  [ReactionWindowType.MonsterChoice]: 1,
  [ReactionWindowType.TaskChoice]: 1,
  /** Nested inside a roll, so strictly shorter than the roll it is about. */
  [ReactionWindowType.ValueChoice]: 0.6,
}

/** Matches StandardTimeControl.reactionCountdownMs. */
const DEFAULT_COUNTDOWN_MS = 5000

export class ReactionManager implements IReactionManager {
  constructor(
    private readonly gs: GameState,
    private readonly em: GameEventEmitter,
    /** A full-share window's wait. `TimeControl.reactionCountdownMs`. */
    private readonly countdownMs: number = DEFAULT_COUNTDOWN_MS,
  ) {}

  /** This window's slice of the countdown, rounded to whole milliseconds. */
  private timeoutFor(type: ReactionWindowType): number {
    return Math.round(this.countdownMs * WINDOW_SHARE[type])
  }

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
    this.gs.addFrame(frameId, this.gs.clone())
    return frameId
  }

  /** Builds a reaction window and inserts it into the given frame. */
  openWindow(
    frameId: string,
    type: ReactionWindowType,
    respondent: string,
    config: Record<string, unknown> = {},
  ): void {
    if (!this.gs.getFrames().has(frameId)) return
    this.gs.addWindow(frameId, this.buildWindow(type, respondent, config, frameId))
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
        this.timeoutFor(type),
        this.gs,
        frameId,
        this.em,
      )
    }

    if (type === ReactionWindowType.Attack) {
      return new AttackWindow(
        crypto.randomUUID(),
        respondent,
        config['baseRoll'] as number,
        config['monsterId'] as string,
        this.timeoutFor(type),
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
        this.timeoutFor(type),
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
        this.timeoutFor(type),
        this.gs,
        frameId,
        this.em,
        config['sourceCardId'] as string | undefined,
      )
    }

    if (type === ReactionWindowType.CardChoice) {
      return new CardChoiceWindow(
        crypto.randomUUID(),
        respondent,
        (config['options'] as string[]) ?? [],
        this.timeoutFor(type),
        this.gs,
        frameId,
        this.em,
        config['resultKey'] as string | undefined,
        config['sourceCardId'] as string | undefined,
      )
    }

    if (type === ReactionWindowType.MonsterChoice) {
      return new MonsterChoiceWindow(
        crypto.randomUUID(),
        respondent,
        (config['options'] as string[]) ?? [],
        this.timeoutFor(type),
        this.gs,
        frameId,
        this.em,
        undefined,
        config['sourceCardId'] as string | undefined,
      )
    }

    if (type === ReactionWindowType.ValueChoice) {
      return new ValueChoiceWindow(
        crypto.randomUUID(),
        respondent,
        (config['options'] as number[]) ?? [],
        // Strictly shorter than the roll's — see WINDOW_SHARE.
        this.timeoutFor(type),
        this.gs,
        frameId,
        this.em,
        (config['bias'] as ValueBias) ?? 'highest',
        config['sourceCardId'] as string | undefined,
      )
    }

    if (type === ReactionWindowType.TaskChoice) {
      return new TaskChoiceWindow(
        crypto.randomUUID(),
        respondent,
        this.timeoutFor(type),
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

  submitReaction(reaction: IReaction): RequestResult {
    const check = reaction.canExecute(this.gs)
    if (!check.accepted) return check
    reaction.execute(this.gs, this.em)
    return accepted()
  }

  /**
   * A player answering a choice. The window validates the pick and says what
   * it made of it (§4); a window that has already lapsed is nothing to answer.
   */
  submitChoice(
    windowId: string,
    playerId: string,
    choice: unknown,
  ): RequestResult {
    const window = this.gs
      .getFrameByWindowId(windowId)
      ?.frame.windows.find((w) => w.getId() === windowId)
    if (!window?.isOpen()) return refused(RefusalReason.NoSuchWindow)
    return window.submitReaction(playerId, { choice })
  }

  /**
   * A player giving a table window up — the Skip button. A pass is PER SEAT:
   * the window settles once every seat that could still act on it has
   * passed, through the same `resolve()` the clock calls, so nothing
   * downstream can tell a pass from a lapse. Only the table's windows can be
   * passed (a roll or a challenge); a choice is one player's question,
   * answered or dismissed through `submitChoice`, so a pass on one is
   * `WindowNotPassable`. A card landing in the window clears its passes.
   */
  pass(windowId: string, playerId: string): RequestResult {
    const window = this.gs
      .getFrameByWindowId(windowId)
      ?.frame.windows.find((w) => w.getId() === windowId)
    if (!window?.isOpen()) return refused(RefusalReason.NoSuchWindow)
    if (!isPassable(window)) return refused(RefusalReason.WindowNotPassable)
    if (!window.canPass(playerId)) return refused(RefusalReason.WindowNotPassable)
    window.pass(playerId)
    const passed = new Set(window.passedBy())
    if (this.gs.getPlayers().filter((player) => window.canPass(player.getId())).every((player) => passed.has(player.getId()))) {
      window.resolve()
    }
    return accepted()
  }

}
