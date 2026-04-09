import { ReactionWindowType } from 'shared'
import { GameState } from '../game-state'
import { IReactionWindow } from '../interfaces'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventFactory } from '../events/game-event-factory'
import { ModifierWindow } from './modifier-window'
import { ChallengeWindow } from './challenge-window'

export class ReactionManager {
  /** Set inside openFrame(); consumed by AbilityProcessor after each task step. */
  private _lastFrameId: string | null = null

  constructor(
    private readonly gs: GameState,
    private readonly em: GameEventEmitter,
  ) {}

  // ---------------------------------------------------------------------------
  // Frame API — single entry point for both task steps and actions.
  // ---------------------------------------------------------------------------

  /**
   * Snapshots GS and inserts an empty frame. Returns the frameId.
   * AbilityProcessor reads _lastFrameId after each step to decide
   * whether to suspend the pipeline.
   */
  openFrame(): string {
    const frameId = crypto.randomUUID()
    const snapshot = this.gs.clone()
    this.gs.addFrame(frameId, { snapshot, windows: [], cardsSpent: [] })
    this._lastFrameId = frameId
    return frameId
  }

  /**
   * Builds a reaction window and inserts it into the given frame.
   * type/config are captured in the settlement closure — not stored on GameFrame.
   */
  openWindow(
    frameId: string,
    type: ReactionWindowType,
    respondent: string,
    config: Record<string, unknown> = {},
  ): void {
    const frame = this.gs.frames.get(frameId)
    if (!frame) return
    const window = this.buildWindow(type, respondent, config, frameId)
    frame.windows.push(window)
  }

  /** Consumed by AbilityProcessor after each task step. */
  takeLastFrameId(): string | null {
    const id = this._lastFrameId
    this._lastFrameId = null
    return id
  }

  // ---------------------------------------------------------------------------
  // Frame settlement — called from within each window's onResolve.
  // ---------------------------------------------------------------------------

  private settleFrame(
    frameId: string,
    result: unknown,
    type: ReactionWindowType,
    config: Record<string, unknown>,
  ): void {
    const frame = this.gs.frames.get(frameId)
    if (!frame) return

    if (this.shouldRollback(type, config, result)) {
      const cardsSpent = [...frame.cardsSpent]
      this.gs.restoreFrame(frameId)
      // Spent cards were restored to hands by the snapshot — discard them now.
      for (const cardId of cardsSpent) {
        for (const player of this.gs.getPlayers()) {
          if (player.getHand().includes(cardId)) {
            player.removeFromHand(cardId)
            this.em.emit(GameEventFactory.cardDiscarded(player.getId(), cardId))
            break
          }
        }
        this.gs.getDiscardPile().add(cardId)
      }
    } else {
      this.gs.releaseFrame(frameId)
      // Emit domain outcome events before FrameResolved so ability triggers
      // (e.g. hero ability on RollSuccess) fire before the pipeline resumes.
      this.emitOutcomeEvents(type, config, result)
    }

    // Always notify — client needs to know the frame closed. On rollback the
    // AP finds no suspended pipeline for this frameId and does nothing.
    this.em.emit(GameEventFactory.frameResolved(frameId, [result]))
  }

  private shouldRollback(
    type: ReactionWindowType,
    config: Record<string, unknown>,
    result: unknown,
  ): boolean {
    if (type === ReactionWindowType.Modifier) {
      const rollReq = config['rollReq'] as number | undefined
      const finalRoll = result as number | undefined
      return rollReq !== undefined && finalRoll !== undefined && finalRoll < rollReq
    }
    return false
  }

  /**
   * Emit game-domain events that follow from a successful frame settlement.
   * Keeping this here means both task-pipeline and action-level frames share
   * the same outcome logic — no need for ApplyRollResultTask.
   */
  private emitOutcomeEvents(
    type: ReactionWindowType,
    config: Record<string, unknown>,
    result: unknown,
  ): void {
    if (type === ReactionWindowType.Modifier) {
      const heroId = config['heroId'] as string
      const rollerId = config['rollerId'] as string
      this.gs.markAbilityUsed(heroId)
      this.em.emit(GameEventFactory.rollSuccess(rollerId, heroId))
    }
  }

  // ---------------------------------------------------------------------------
  // Window factory
  // ---------------------------------------------------------------------------

  private buildWindow(
    type: ReactionWindowType,
    respondent: string,
    config: Record<string, unknown>,
    frameId: string,
  ): IReactionWindow {
    if (type === ReactionWindowType.Modifier) {
      const id = crypto.randomUUID()
      return new ModifierWindow(
        id,
        respondent,
        config['baseRoll'] as number,
        config['rollReq'] as number,
        config['heroId'] as string,
        5000,
        this.em,
        (finalRoll) => {
          this.settleFrame(frameId, finalRoll, type, config)
          return []
        },
        () => { /* frame release handles cleanup */ },
      )
    }

    if (type === ReactionWindowType.Challenge) {
      const id = crypto.randomUUID()
      return new ChallengeWindow(
        id,
        respondent,
        config['cardId'] as string,
        5000,
        this.em,
        (defenderWins) => this.settleFrame(frameId, defenderWins, type, config),
        () => { /* frame release handles cleanup */ },
      )
    }

    // Phase 1 stub for Choice and unknown types — resolve immediately.
    const stub = makeStubWindow(type)
    const chosenId = (config['choices'] as string[])?.[0] ?? ''
    queueMicrotask(() => this.settleFrame(frameId, chosenId, type, config))
    return stub
  }

  // ---------------------------------------------------------------------------
  // Player input routing — scans gs.frames.
  // ---------------------------------------------------------------------------

  submitReaction(windowId: string, playerId: string, payload: unknown): void {
    const entry = this.gs.getFrameByWindowId(windowId)
    entry?.frame.windows.find((w) => w.getId() === windowId)?.submitReaction(playerId, payload)
  }

  applyModifier(playerId: string, value: number, targetPlayerId?: string): void {
    const challengeEntry = this.gs.getFrameByWindowType(ReactionWindowType.Challenge)
    if (challengeEntry && targetPlayerId) {
      challengeEntry.frame.windows
        .find((w) => w.getType() === ReactionWindowType.Challenge)
        ?.submitReaction(playerId, { type: 'modifier', value, targetPlayerId })
      return
    }

    const modifierEntry = this.gs.getFrameByWindowType(ReactionWindowType.Modifier)
    modifierEntry?.frame.windows
      .find((w) => w.getType() === ReactionWindowType.Modifier)
      ?.submitReaction(playerId, { value })
  }

  startChallenge(challengerId: string): void {
    const entry = this.gs.getFrameByWindowType(ReactionWindowType.Challenge)
    entry?.frame.windows
      .find((w) => w.getType() === ReactionWindowType.Challenge)
      ?.submitReaction(challengerId, { type: 'challenge', challengerId })
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStubWindow(type: ReactionWindowType): IReactionWindow {
  const id = crypto.randomUUID()
  let open = true
  return {
    getId: () => id,
    getType: () => type,
    isOpen: () => open,
    submitReaction: () => {},
    resolve: () => { open = false },
  }
}
