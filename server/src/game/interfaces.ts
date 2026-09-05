import {
  ActionType,
  CardType,
  GameEventType,
  IGameEvent,
  IGameEventEmitter,
  PassiveType,
  ReactionType,
  ReactionWindowType,
  RefusalReason,
  RequestResult,
  RollContext,
  RollResult,
  TriggerScope,
} from 'shared'
import type { GameState } from './pipelines/game-state'
import type { AbilityContext } from './abilities/ability-context'
import type { NO_CONTEXT_RESULT } from './abilities/ability-context'
import type { Player } from './state-structures/player'

// ---------------------------------------------------------------------------
// Request results — what every player door hands back (shared/src/types.ts).
// ---------------------------------------------------------------------------

export const accepted = (): RequestResult => ({ accepted: true })

export const refused = (reason: RefusalReason): RequestResult => ({
  accepted: false,
  reason,
})

// ---------------------------------------------------------------------------
// Turn actions
// ---------------------------------------------------------------------------

export interface IAction {
  getId(): string
  getType(): ActionType
  getPlayerId(): string
  getCost(): number
  isReactable(): boolean
  /** Whether the board would take this now, and if not, why. */
  canExecute(gs: GameState): RequestResult
  execute(gs: GameState): void
}

export interface IReaction {
  getId(): string
  getType(): ReactionType
  getPlayerId(): string
  /** Whether the board would take this now, and if not, why. */
  canExecute(gs: GameState): RequestResult
  execute(gs: GameState, em: IGameEventEmitter): void
}

// ---------------------------------------------------------------------------
// Reaction system, as an ability step sees it.
// Implemented by ReactionManager; declared here to avoid the import cycle.
// ---------------------------------------------------------------------------

export interface IReactionManager {
  /** Snapshots GameState and inserts an empty frame. Returns the frameId. */
  openFrame(): string
  /** Builds a reaction window and inserts it into the given frame. */
  openWindow(
    frameId: string,
    type: ReactionWindowType,
    respondent: string,
    config?: Record<string, unknown>,
  ): void
}

// ---------------------------------------------------------------------------
// Ability tasks
// ---------------------------------------------------------------------------

export interface ITask {
  /**
   * Returns the frameId if this step suspended on a window, else nothing.
   * TaskManager reads it to decide whether to park the remaining steps.
   */
  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    rm: IReactionManager,
  ): string | void
}

/**
 * WHEN an ability runs: an event, plus whose events count. Shared by card
 * abilities and by ongoing effects, so the processor checks both the same way.
 */
/** One ability to check against an event, and who owns it. Gathered fresh per event by TaskManager. */
export type AbilitySource = {
  trigger: AbilityTrigger
  steps: ITask[]
  sourceCardId: string
  /** Empty for a monster still in the pile — see TaskManager's NO_OWNER and ownerFor. */
  ownerId: string
  /** Printed on the card, or a rule of the game — see AbilityPipeline.system. */
  system: boolean
}

export type AbilityTrigger = {
  on: GameEventType
  scope: TriggerScope
  /** Matched against the payload's `label` — see TaskConfirmed, ConditionMet. */
  when?: string
}

/** WHEN something runs and WHAT it runs. Everything TaskManager matches. */
export interface IGameRule {
  trigger: AbilityTrigger
  steps: ITask[]
}

/** A rule printed on a card — the abilityRegistry's values, keyed by card id. */
export type IAbilityRule = IGameRule

/** A rule of the game, printed on no card: hero-rules.ts, instance-rules.ts. */
export type ISystemRule = IGameRule

// Same shape, so nothing tells them apart at runtime. TaskManager.abilitySources
// records which table a rule came from on the pipeline instead; only
// AbilityDone reads it.

// ---------------------------------------------------------------------------
// Ongoing effects — stored on Player, swept by TaskManager.
// ---------------------------------------------------------------------------

/** One way an effect can end. Reusable expiries live in abilities/expiries.ts. */
export type EffectExpiry = {
  on: GameEventType
  /** Absent = the event alone decides. */
  shouldExpire?: (gs: GameState, effect: IEffect, event: IGameEvent) => boolean
}

/**
 * A standing rule with a lifetime. An ability is the one-time run; what it
 * leaves behind is this, and this is only ever a rule somebody reads — never
 * behaviour of its own.
 */
export interface IEffect {
  id: string
  /** The card whose ability installed this. Identity for logs and self-matching. */
  sourceCardId: string
  /** Whose effect it is — the player expiry checks and queries resolve against. */
  ownerId: string
  /** Which rule this is, read via gs.hasEffect / gs.getEffects. */
  type: PassiveType
  /** Magnitude, for the rules that carry one. */
  value?: number
  /**
   * Narrows it to rolls ABOUT this card — absent means it applies to
   * everything the owner rolls. Read at the three roll sites, not here.
   */
  cardId?: string
  /**
   * Narrows it to one KIND of roll — absent means every kind. Independent of
   * `cardId`: that says which card the roll is about, this says what the roll
   * is FOR. "+1 when you roll to ATTACK" needs the second and not the first.
   */
  rollContext?: RollContext
  /**
   * Narrows it to plays of these card types — absent means every type. The
   * third narrowing, and the only one about a CARD BEING PLAYED rather than a
   * roll: "Item cards you play cannot be challenged" is this and nothing else.
   */
  cardTypes?: CardType[]
  /** Absent = permanent. Multiple entries = first match ends it. */
  expiry?: EffectExpiry[]
}

// ---------------------------------------------------------------------------
// Win / roll resolution
// ---------------------------------------------------------------------------

export interface IWinCondition {
  /** Per player: a table requiring every condition needs one party to meet them all. */
  isMetBy(gs: GameState, player: Player): boolean
}

export interface IRollResolver {
  resolve(finalRoll: number): RollResult
}

// ---------------------------------------------------------------------------
// Reaction windows
// ---------------------------------------------------------------------------

/** One contribution to a roll: standing effects and played cards share a list. */
export type RollBonus = {
  /** The effect's source card, or the modifier played. Card ids are per copy. */
  cardSource: string
  amount: number
}

/**
 * Which way an unanswered value choice should fall. The window being modified
 * decides, because only it knows what the roll is and whose it is.
 */
export type ValueBias = 'highest' | 'lowest'

/**
 * A window a modifier card can be spent into. PlayModifierReaction probes for
 * this method rather than testing instanceof.
 */
/**
 * A table window the seats may give up. A pass is PER SEAT: the window
 * settles once every seat that could still act on it has passed (the
 * ReactionManager decides who that is), and a card landing in it clears the
 * passes — the roll changed under them, everyone gets another look.
 */
export interface IPassableWindow extends IReactionWindow {
  canPass(playerId: string): boolean
  pass(playerId: string): void
  passedBy(): readonly string[]
}

export const isPassable = (window: IReactionWindow): window is IPassableWindow =>
  typeof (window as Partial<IPassableWindow>).pass === 'function'

export interface IModifiableWindow extends IReactionWindow {
  /** Whether a modifier aimed at `playerId` belongs in this window, and if not, why. */
  acceptsModifierFor(playerId: string): RequestResult
  /**
   * A card has been committed to this window and is working out what it is
   * worth. Keeps the window alive until it lands: the bonus arrives from the
   * card's own entry now, one or more choices later, so the submission can no
   * longer be the only thing that says "somebody is still acting".
   */
  cardSpent(): void
  /**
   * Which way to fall when `playerId` never answers the value choice for a
   * bonus aimed at `targetPlayerId`. Each window has its own rule, the way
   * each has its own `acceptsModifierFor` — a plain roll asks whether you are
   * helping yourself, a challenge asks which side of the contest you pushed.
   */
  valueBiasFor(playerId: string, targetPlayerId: string): ValueBias
}

/** Base interface for any timed reaction window. */
export interface IReactionWindow {
  getId(): string
  getType(): ReactionWindowType
  /** The roller for a roll, the defender for a challenge, the one player who
   * may answer a choice. */
  getRespondentId(): string
  /** What may be picked. Empty for a roll or a challenge — those are answered
   * by spending a card. */
  getOptions(): readonly unknown[]
  /** True while the window is waiting for responses; false after it resolves. */
  isOpen(): boolean
  /** Route a player's reaction payload into the window. Says whether it took it. */
  submitReaction(playerId: string, payload: unknown): RequestResult
  /** Force immediate resolution (e.g. timeout, test helpers). */
  resolve(): void
  /**
   * Close WITHOUT an outcome: the clock is cleared, `ReactionWindowClosed`
   * goes out with `cancelled: true`, no default is picked and no
   * `FrameResolved` follows. A rollback of an earlier frame does this to
   * every window opened after it (GameState.revertFrame).
   */
  cancel(): void
  /**
   * A question the respondent may simply walk away from — a TaskChoice
   * offering DISMISS. Under seamless reactions the active player's next
   * action forfeits one (TurnManager.enqueue) instead of being refused.
   */
  isOptional(): boolean
  /** Whether this window holds actions under seamless reactions. */
  blocksActions(playerId: string): boolean
  /**
   * Shortens the clock to `ms` when more than that is left; a shorter clock
   * is untouched. The turn's end caps every window this way (§11).
   */
  capClock(ms: number): void
  /**
   * What the window is asking, read LIVE: the fields it announced at open
   * plus whatever moved since — a bonus that landed, a challenge that
   * started. The view copies it, so a screen drawn from a snapshot alone can
   * show the roll it is being asked about.
   */
  getDetail(): Record<string, unknown>
  /** When the clock runs out, epoch ms. Moves when the window resets its timer. */
  getDeadline(): number
  /**
   * Context key this window's outcome is filed under; TaskManager writes
   * it on resume. NO_CONTEXT_RESULT when the outcome is not an ability input.
   */
  resultKey(): string | typeof NO_CONTEXT_RESULT
  /**
   * The card this window is ABOUT, for the windows that settle on one — the
   * same thing `FrameResolved` carries as its `cardId`. A challenge is about
   * the card it contests; a roll and a choice are about no card at all.
   *
   * It is what separates a card the frame CONTESTS from the cards spent INTO
   * it, which is how the instance zone tells a play from a payment.
   */
  subjectCardId?(): string | undefined
}
