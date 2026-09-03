import type { AuthenticatedAccount } from '../auth/auth.types'
import { filter, firstValueFrom, take } from 'rxjs'
import {
  AccountAlreadyInGameError,
  GameServerUnavailableError,
  InvalidReadyPlayerCountError,
  LobbyFullError,
  OnlyHostCanStartError,
} from './lobby.errors'
import type { IGameServerClient } from './lobby.interfaces'
import { LobbyEventStreamService } from './lobby-event-stream.service'
import { LobbyService } from './lobby.service'
import type { LobbySseEvent } from './lobby.types'
import { InMemoryGameAssignmentStore } from './stores/in-memory-game-assignment.store'
import { InMemoryLobbyStore } from './stores/in-memory-lobby.store'

function account(index: number): AuthenticatedAccount {
  return {
    accountId: `account-${index}`,
    username: `player-${index}`,
  }
}

describe('LobbyService', () => {
  let lobbyStore: InMemoryLobbyStore
  let assignmentStore: InMemoryGameAssignmentStore
  let gameServer: jest.Mocked<IGameServerClient>
  let service: LobbyService

  beforeEach(() => {
    lobbyStore = new InMemoryLobbyStore()
    assignmentStore = new InMemoryGameAssignmentStore()
    gameServer = {
      createGame: jest.fn().mockResolvedValue({
        gameId: 'game-1',
        webSocketUrl: 'http://localhost:3001',
      }),
    }
    service = new LobbyService(
      lobbyStore,
      assignmentStore,
      gameServer,
      new LobbyEventStreamService(),
    )
  })

  it('keeps an ordered ready list and makes the first player host', async () => {
    await service.ready(account(1))
    const secondSnapshot = await service.ready(account(2))

    expect(secondSnapshot.readyPlayers).toEqual([account(1), account(2)])
    expect(secondSnapshot.self).toMatchObject({
      state: 'READY',
      isHost: false,
    })

    const hostSnapshot = await service.getSnapshot(account(1))
    expect(hostSnapshot.self.isHost).toBe(true)
    expect(hostSnapshot.settings).toEqual({ gameConfig: 'default' })
  })

  it('moves host authority to the next player when the host unreadies', async () => {
    await service.ready(account(1))
    await service.ready(account(2))

    await service.unready(account(1))

    const secondSnapshot = await service.getSnapshot(account(2))
    expect(secondSnapshot.self.isHost).toBe(true)
  })

  it('rejects a fifth ready player without changing the list', async () => {
    for (let index = 1; index <= 4; index += 1) {
      await service.ready(account(index))
    }

    await expect(service.ready(account(5))).rejects.toBeInstanceOf(
      LobbyFullError,
    )
    await expect(lobbyStore.getReadyPlayers()).resolves.toHaveLength(4)
  })

  it('allows only the host to start with two to four ready players', async () => {
    await service.ready(account(1))
    await expect(
      service.getStartPlayers(account(1).accountId),
    ).rejects.toBeInstanceOf(InvalidReadyPlayerCountError)

    await service.ready(account(2))
    await expect(
      service.getStartPlayers(account(2).accountId),
    ).rejects.toBeInstanceOf(OnlyHostCanStartError)
    await expect(
      service.getStartPlayers(account(1).accountId),
    ).resolves.toEqual([account(1), account(2)])

    // Validation alone does not remove players before game creation succeeds.
    await expect(lobbyStore.getReadyPlayers()).resolves.toHaveLength(2)
  })

  it('reports assigned accounts as in-game and rejects ready requests', async () => {
    // Simulate the brief transition before a started group leaves the ready list.
    await lobbyStore.addReadyPlayer(account(1))
    await assignmentStore.assign([
      {
        accountId: account(1).accountId,
        gameId: 'game-1',
        webSocketUrl: 'http://localhost:3001',
        assignedAt: new Date(),
      },
    ])

    const snapshot = await service.getSnapshot(account(1))
    expect(snapshot.self.state).toBe('IN_GAME')
    expect(snapshot.self.isHost).toBe(false)
    await expect(service.ready(account(1))).rejects.toBeInstanceOf(
      AccountAlreadyInGameError,
    )

    await service.ready(account(2))
    await expect(
      service.startGame(account(1).accountId),
    ).rejects.toBeInstanceOf(AccountAlreadyInGameError)
    expect(gameServer.createGame).not.toHaveBeenCalled()
  })

  it('creates a game, assigns its players, and frees the ready list', async () => {
    await service.ready(account(1))
    await service.ready(account(2))

    await expect(service.startGame(account(1).accountId)).resolves.toEqual({
      gameId: 'game-1',
      status: 'STARTING',
    })
    expect(gameServer.createGame).toHaveBeenCalledWith({
      players: [account(1), account(2)],
      gameConfig: 'default',
    })
    await expect(lobbyStore.getReadyPlayers()).resolves.toEqual([])
    await expect(assignmentStore.findByGameId('game-1')).resolves.toHaveLength(
      2,
    )
  })

  it('keeps players ready when the Game server cannot create the game', async () => {
    await service.ready(account(1))
    await service.ready(account(2))
    gameServer.createGame.mockRejectedValue(new Error('connection refused'))

    await expect(
      service.startGame(account(1).accountId),
    ).rejects.toBeInstanceOf(GameServerUnavailableError)
    await expect(lobbyStore.getReadyPlayers()).resolves.toEqual([
      account(1),
      account(2),
    ])
    await expect(assignmentStore.findByGameId('game-1')).resolves.toEqual([])
  })

  it('sends caller-specific lobby updates to every connected account', async () => {
    const firstEvents: LobbySseEvent[] = []
    const secondEvents: LobbySseEvent[] = []
    const firstConnection = service
      .events(account(1))
      .subscribe((event) => firstEvents.push(event))
    const secondConnection = service
      .events(account(2))
      .subscribe((event) => secondEvents.push(event))

    try {
      await service.ready(account(1))

      const firstUpdate = latestLobbyUpdate(firstEvents)
      const secondUpdate = latestLobbyUpdate(secondEvents)
      expect(firstUpdate.data.readyPlayers).toEqual([account(1)])
      expect(firstUpdate.data.self.state).toBe('READY')
      expect(secondUpdate.data.readyPlayers).toEqual([account(1)])
      expect(secondUpdate.data.self.state).toBe('IDLE')
    } finally {
      firstConnection.unsubscribe()
      secondConnection.unsubscribe()
    }
  })

  it('sends game assignments only to selected accounts', async () => {
    await service.ready(account(1))
    await service.ready(account(2))
    const selectedEvents: LobbySseEvent[] = []
    const outsiderEvents: LobbySseEvent[] = []
    const selectedConnection = service
      .events(account(2))
      .subscribe((event) => selectedEvents.push(event))
    const outsiderConnection = service
      .events(account(3))
      .subscribe((event) => outsiderEvents.push(event))

    try {
      await service.startGame(account(1).accountId)

      expect(selectedEvents).toContainEqual({
        type: 'game-assigned',
        data: {
          gameId: 'game-1',
          webSocketUrl: 'http://localhost:3001',
        },
      })
      expect(
        outsiderEvents.some((event) => event.type === 'game-assigned'),
      ).toBe(false)
      expect(latestLobbyUpdate(outsiderEvents).data.readyPlayers).toEqual([])
    } finally {
      selectedConnection.unsubscribe()
      outsiderConnection.unsubscribe()
    }
  })

  it('replays an active game assignment after SSE reconnects', async () => {
    await service.ready(account(1))
    await service.ready(account(2))
    await service.startGame(account(1).accountId)

    const assignmentEvent = await firstValueFrom(
      service.events(account(1)).pipe(
        filter((event) => event.type === 'game-assigned'),
        take(1),
      ),
    )

    expect(assignmentEvent.data).toEqual({
      gameId: 'game-1',
      webSocketUrl: 'http://localhost:3001',
    })
  })

  it('clears completed-game assignments and publishes the idle state', async () => {
    await service.ready(account(1))
    await service.ready(account(2))
    await service.startGame(account(1).accountId)
    const events: LobbySseEvent[] = []
    const connection = service
      .events(account(1))
      .subscribe((event) => events.push(event))

    try {
      await expect(service.completeGame('game-1')).resolves.toBe(2)
      const updateCount = events.filter(
        (event) => event.type === 'lobby-updated',
      ).length
      await expect(service.completeGame('game-1')).resolves.toBe(0)

      await expect(assignmentStore.findByGameId('game-1')).resolves.toEqual([])
      expect(latestLobbyUpdate(events).data.self.state).toBe('IDLE')
      expect(
        events.filter((event) => event.type === 'lobby-updated'),
      ).toHaveLength(updateCount)
    } finally {
      connection.unsubscribe()
    }
  })
})

function latestLobbyUpdate(
  events: readonly LobbySseEvent[],
): Extract<LobbySseEvent, { type: 'lobby-updated' }> {
  const event = [...events]
    .reverse()
    .find((candidate) => candidate.type === 'lobby-updated')
  if (!event || event.type !== 'lobby-updated') {
    throw new Error('No lobby-updated event was received')
  }
  return event
}
