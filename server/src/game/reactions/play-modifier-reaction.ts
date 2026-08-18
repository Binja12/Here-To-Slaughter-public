import { IGameEventEmitter, ReactionType, ReactionWindowType } from 'shared'
import { IModifiableWindow, IReaction, IReactionWindow } from '../interfaces'
import { GameState } from '../game-state'
import { GameEventFactory } from '../events/game-event-factory'

export class PlayModifierReaction implements IReaction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    private readonly value: number,
    private readonly targetPlayerId: string,
  ) {}

  getId(): string {
    return this.id
  }
  getType(): ReactionType {
    return ReactionType.ApplyModifier
  }
  getPlayerId(): string {
    return this.playerId
  }

  canExecute(gs: GameState): boolean {
    const open = this.openWindow(gs)
    if (!open) return false
    if (!gs.getPlayer(this.playerId)?.getHand().includes(this.cardId))
      return false

    // execute() burns the card before it submits, so a target the window
    // would refuse must be caught while the card is still in hand.
    return open.window.acceptsModifierFor(this.targetPlayerId)
  }

  execute(gs: GameState, em: IGameEventEmitter): void {
    const open = this.openWindow(gs)
    if (!open) return
    gs.burnCard(open.frameId, this.playerId, this.cardId)

    // Before the submission, so the log reads played-then-applied. burnCard
    // emits nothing, so this is the only record the card was spent.
    em.emit(
      GameEventFactory.modifierPlayed(
        this.playerId,
        this.cardId,
        this.value,
        this.targetPlayerId,
      ),
    )

    open.window.submitReaction(this.playerId, {
      // ChallengeWindow takes challenges and modifiers on one method, so the
      // kind is named; ModifierWindow ignores it.
      type: 'modifier',
      value: this.value,
      cardId: this.cardId,
      targetPlayerId: this.targetPlayerId,
    })
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /** The open window a modifier can go into — a plain roll or a challenge. */
  private openWindow(
    gs: GameState,
  ): { frameId: string; window: IModifiableWindow } | undefined {
    for (const type of [
      ReactionWindowType.Modifier,
      ReactionWindowType.Challenge,
    ]) {
      const entry = gs.getFrameByWindowType(type)
      const window = entry?.frame.windows.find((w) => w.getType() === type)
      if (entry && window && acceptsModifiers(window)) {
        return { frameId: entry.frameId, window }
      }
    }
    return undefined
  }
}

/** Capability probe, not instanceof — keeps concrete window classes out. */
function acceptsModifiers(w: IReactionWindow): w is IModifiableWindow {
  return typeof (w as IModifiableWindow).acceptsModifierFor === 'function'
}
