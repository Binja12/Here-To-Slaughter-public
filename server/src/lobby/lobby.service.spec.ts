import type { AuthenticatedAccount } from '../auth/auth.types'
import {
  AccountAlreadyInGameError,
  InvalidReadyPlayerCountError,
  LobbyFullError,
  OnlyHostCanStartError,
} from './lobby.errors'
import { LobbyService } from './lobby.service'
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
  let service: LobbyService

  beforeEach(() => {
    lobbyStore = new InMemoryLobbyStore()
    assignmentStore = new InMemoryGameAssignmentStore()
    service = new LobbyService(lobbyStore, assignmentStore)
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
  })
})
