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

    // Checked here, not only in the window: execute() BURNS the card before it
    // submits, so a target the window would refuse has to be caught while the
    // card is still in hand. The window owns the rule; this only asks.
    return open.window.acceptsModifierFor(this.targetPlayerId)
  }

  execute(gs: GameState, em: IGameEventEmitter): void {
    const open = this.openWindow(gs)
    if (!open) return
    gs.burnCard(open.frameId, this.playerId, this.cardId)

    // Announced BEFORE the submission, so the log reads played-then-applied and
    // the two events cannot arrive out of order. burnCard emits nothing itself,
    // so this is the only word that the card was spent.
    em.emit(
      GameEventFactory.modifierPlayed(
        this.playerId,
        this.cardId,
        this.value,
        this.targetPlayerId,
      ),
    )

    open.window.submitReaction(this.playerId, {
      // ChallengeWindow multiplexes challenge and modifier submissions on one
      // method, so the kind is named. ModifierWindow reads only what it needs
      // and ignores the extra field.
      type: 'modifier',
      value: this.value,
      // The window records which card paid for the bonus, so a roll can be
      // shown broken down by source rather than as one opaque total.
      cardId: this.cardId,
      targetPlayerId: this.targetPlayerId,
    })
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * The open window a modifier can be played into — a plain roll OR a
   * challenge. Only the roll window used to be looked for, which left the
   * challenge branch of ChallengeWindow.submitReaction unreachable: a modifier
   * could never be spent on a challenge, despite that being the only reason
   * `targetPlayerId` exists.
   */
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

/**
 * Capability probe, not an `instanceof`: keeps this reaction free of concrete
 * window classes, so adding a third modifiable window needs no change here.
 */
function acceptsModifiers(w: IReactionWindow): w is IModifiableWindow {
  return typeof (w as IModifiableWindow).acceptsModifierFor === 'function'
}
