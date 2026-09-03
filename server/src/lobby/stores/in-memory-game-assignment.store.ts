import { Injectable } from '@nestjs/common'
import { IGameAssignmentStore } from '../lobby.interfaces'
import { GameAssignment } from '../lobby.types'

@Injectable()
export class InMemoryGameAssignmentStore implements IGameAssignmentStore {
  private readonly assignmentsByAccountId = new Map<string, GameAssignment>()

  async assign(assignments: readonly GameAssignment[]): Promise<void> {
    const incomingAccountIds = new Set<string>()

    // Validate the whole group before storing any player.
    for (const assignment of assignments) {
      // The same account cannot appear twice in one game request.
      if (incomingAccountIds.has(assignment.accountId)) {
        throw new Error(
          `Duplicate account in assignment batch: ${assignment.accountId}`,
        )
      }

      // A player already assigned to a game cannot join another one.
      if (this.assignmentsByAccountId.has(assignment.accountId)) {
        throw new Error(
          `Account already has an active game: ${assignment.accountId}`,
        )
      }

      // Remember ids already checked in this request.
      incomingAccountIds.add(assignment.accountId)
    }

    // Validation passed, so assign every player in the game group.
    for (const assignment of assignments) {
      this.assignmentsByAccountId.set(
        assignment.accountId,
        // Store a copy so the caller cannot change the assignment by reference.
        cloneAssignment(assignment),
      )
    }
  }

  async findByAccountId(
    accountId: string,
  ): Promise<GameAssignment | undefined> {
    const assignment = this.assignmentsByAccountId.get(accountId)

    // Return a copy so callers cannot change the stored assignment.
    return assignment ? cloneAssignment(assignment) : undefined
  }

  async findByGameId(gameId: string): Promise<GameAssignment[]> {
    // Collect every account assigned to the requested game.
    return [...this.assignmentsByAccountId.values()]
      .filter((assignment) => assignment.gameId === gameId)
      .map(cloneAssignment)
  }

  async removeByAccountId(accountId: string): Promise<boolean> {
    return this.assignmentsByAccountId.delete(accountId)
  }

  async removeByGameId(gameId: string): Promise<number> {
    let removed = 0

    // Clear all player assignments when their game is complete.
    for (const [accountId, assignment] of this.assignmentsByAccountId) {
      if (assignment.gameId === gameId) {
        this.assignmentsByAccountId.delete(accountId)
        removed += 1
      }
    }
    return removed
  }
}

function cloneAssignment(assignment: GameAssignment): GameAssignment {
  return { ...assignment, assignedAt: new Date(assignment.assignedAt) }
}
