import { Injectable } from '@nestjs/common'
import { Observable } from 'rxjs'
import type { Subscriber } from 'rxjs'
import type { AuthenticatedAccount } from '../auth/auth.types'
import type {
  GameAssignment,
  LobbySnapshot,
  LobbySseEvent,
} from './lobby.types'

type LobbyConnection = {
  account: AuthenticatedAccount
  subscriber: Subscriber<LobbySseEvent>
  delivery: Promise<void>
}

@Injectable()
export class LobbyEventStreamService {
  private readonly connectionsByAccountId = new Map<
    string,
    Set<LobbyConnection>
  >()

  open(
    account: AuthenticatedAccount,
    initialEvents: () => Promise<LobbySseEvent[]>,
  ): Observable<LobbySseEvent> {
    return new Observable((subscriber) => {
      const connection: LobbyConnection = {
        account: { ...account },
        subscriber,
        delivery: Promise.resolve(),
      }

      // Register before loading state so updates cannot miss a new connection.
      this.addConnection(connection)
      void this.enqueue(connection, async () => {
        for (const event of await initialEvents()) subscriber.next(event)
      })

      // Nest calls this cleanup when the browser closes the SSE connection.
      return () => this.removeConnection(connection)
    })
  }

  async publishLobbyUpdated(
    getSnapshot: (account: AuthenticatedAccount) => Promise<LobbySnapshot>,
  ): Promise<void> {
    await Promise.all(
      [...this.connectionsByAccountId.values()].map(async (connections) => {
        const connection = connections.values().next().value
        if (!connection) return

        // One account can have several tabs, but all need the same snapshot.
        const snapshot = await getSnapshot(connection.account)
        await Promise.all(
          [...connections].map((recipient) =>
            this.enqueue(recipient, () => {
              recipient.subscriber.next({
                type: 'lobby-updated',
                data: snapshot,
              })
            }),
          ),
        )
      }),
    )
  }

  async publishGameAssignments(
    assignments: readonly GameAssignment[],
  ): Promise<void> {
    await Promise.all(
      assignments.flatMap((assignment) => {
        const connections = this.connectionsByAccountId.get(
          assignment.accountId,
        )
        if (!connections) return []

        // Send the private game address only to accounts selected for this game.
        return [...connections].map((connection) =>
          this.enqueue(connection, () => {
            connection.subscriber.next({
              type: 'game-assigned',
              data: {
                gameId: assignment.gameId,
                webSocketUrl: assignment.webSocketUrl,
              },
            })
          }),
        )
      }),
    )
  }

  private addConnection(connection: LobbyConnection): void {
    const connections =
      this.connectionsByAccountId.get(connection.account.accountId) ?? new Set()
    connections.add(connection)
    this.connectionsByAccountId.set(connection.account.accountId, connections)
  }

  private removeConnection(connection: LobbyConnection): void {
    const connections = this.connectionsByAccountId.get(
      connection.account.accountId,
    )
    if (!connections) return

    connections.delete(connection)
    if (connections.size === 0) {
      this.connectionsByAccountId.delete(connection.account.accountId)
    }
  }

  private enqueue(
    connection: LobbyConnection,
    send: () => void | Promise<void>,
  ): Promise<void> {
    // Keep initial state and later updates ordered on each connection.
    connection.delivery = connection.delivery
      .then(async () => {
        if (!connection.subscriber.closed) await send()
      })
      .catch((error: unknown) => {
        if (!connection.subscriber.closed) connection.subscriber.error(error)
      })
    return connection.delivery
  }
}
