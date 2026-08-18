import { PassiveType, PlayerData } from 'shared'
import type { ActiveEffect } from './interfaces'

export class Player {
  /** Immutable per-turn budget (used to reset at turn start). */
  private readonly initialActionPoints: number
  /** Current mutable action points for the active turn. */
  private ActionPoints: number
  /**
   * Ongoing effects installed on this player by resolved ability pipelines.
   * Card abilities are NOT here — those are read from the party each event.
   * Ownership is structural rather than a field to filter on, and scope checks
   * resolve locally.
   *
   * Plain data, copied by clone(), so frame rollback covers it.
   */
  private effects: ActiveEffect[] = []

  constructor(private data: PlayerData) {
    this.initialActionPoints = data.actionPoints
    this.ActionPoints = data.actionPoints
  }

  getId(): string {
    return this.data.id
  }
  getName(): string {
    return this.data.name
  }
  getHand(): string[] {
    return this.data.hand
  }
  getHandSize(): number {
    return this.data.hand.length
  }
  getPartyId(): string {
    return this.data.partyId
  }

  // --- Action points ---

  /** Maximum action points per turn (immutable). */
  getActionPointsPerTurn(): number {
    return this.initialActionPoints
  }
  /** Current remaining action points this turn. */
  getActionPoints(): number {
    return this.ActionPoints
  }
  decreaseActionPoints(amount: number): number {
    this.ActionPoints -= amount
    return this.ActionPoints
  }
  increaseActionPoints(amount: number): number {
    this.ActionPoints += amount
    return this.ActionPoints
  }
  /** Resets current AP to the per-turn maximum. Called by TurnManager.startTurn(). */
  resetActionPoints(): void {
    this.ActionPoints = this.initialActionPoints
  }

  // --- Hand ---

  addToHand(cardId: string): void {
    this.data.hand.push(cardId)
  }
  removeFromHand(cardId: string): void {
    this.data.hand = this.data.hand.filter((id) => id !== cardId)
  }

  // --- Installed abilities & ongoing effects ---

  addEffect(effect: ActiveEffect): void {
    this.effects.push(effect)
  }

  /**
   * A COPY. The list is the player's own — handing out the field would let any
   * caller add or drop effects without going through addEffect/removeEffect.
   * It also gives the sweep a stable list to walk while it removes.
   */
  getEffects(): ActiveEffect[] {
    return [...this.effects]
  }

  /** Drops the effect with this id, if it is still present. */
  removeEffect(effectId: string): void {
    this.effects = this.effects.filter((e) => e.id !== effectId)
  }

  /** True while any installed effect carries the given passive flag. */
  hasEffect(type: PassiveType): boolean {
    return this.effects.some((e) => e.passive?.type === type)
  }

  /** Entries, not a total: callers need the source card, not just the amount. */
  getEffectsWithPassive(type: PassiveType): ActiveEffect[] {
    return this.effects.filter((e) => e.passive?.type === type)
  }

  clone(): Player {
    const copy = new Player({
      ...this.data,
      hand: [...this.data.hand],
    })
    // Explicit: the constructor seeds this from data.actionPoints, which is
    // the per-turn MAXIMUM — without this, every rollback refunds spent AP.
    copy.ActionPoints = this.ActionPoints
    // Effects are immutable records: copy the array, share the entries.
    copy.effects = [...this.effects]
    return copy
  }
}
