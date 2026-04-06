import { PlayerData } from 'shared'

export class Player {
  /** Immutable per-turn budget (used to reset at turn start). */
  private readonly initialActionPoints: number
  /** Current mutable action points for the active turn. */
  private ActionPoints: number

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
}
