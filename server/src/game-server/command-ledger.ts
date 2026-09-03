import type { CommandResult } from 'shared'

/** How many answered commands one seat keeps. A retry is seconds old, not hours. */
const REMEMBERED_PER_SEAT = 64

// ---------------------------------------------------------------------------
// What each seat was last answered, by command id — so a retried command is
// answered from memory and never executed twice. Keyed by SEAT rather than
// by connection: the retry that matters is the one that follows a dropped
// socket, and it arrives on a new connection. `commandId` is minted by the
// client and unique within its own account (contract §6), so seats never
// collide.
//
// Bounded per seat by insertion order. Malformed envelopes are remembered
// too, when they carried a readable id: the repeat gets the same answer.
// ---------------------------------------------------------------------------

export class CommandLedger {
  private readonly bySeat = new Map<string, Map<string, CommandResult>>()

  recall(seat: string, commandId: string): CommandResult | undefined {
    return this.bySeat.get(seat)?.get(commandId)
  }

  /** A seat that left its table has no game left to retry into. */
  forget(seat: string): void {
    this.bySeat.delete(seat)
  }

  remember(seat: string, commandId: string, result: CommandResult): void {
    let answers = this.bySeat.get(seat)
    if (!answers) {
      answers = new Map()
      this.bySeat.set(seat, answers)
    }

    answers.set(commandId, result)
    if (answers.size > REMEMBERED_PER_SEAT) {
      // Maps iterate in insertion order, so the first key is the oldest.
      const oldest = answers.keys().next().value
      if (oldest !== undefined) answers.delete(oldest)
    }
  }
}
