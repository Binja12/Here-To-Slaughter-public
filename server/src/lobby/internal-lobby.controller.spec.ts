import { ClientProxyFactory, Transport } from '@nestjs/microservices'
import type { MicroserviceOptions } from '@nestjs/microservices'
import { Test } from '@nestjs/testing'
import { createServer } from 'node:net'
import { GAME_COMPLETED_PATTERN } from 'shared'
import type { GameCompletedEvent } from 'shared'
import { AppModule } from '../app.module'
import { InternalLobbyController } from './internal-lobby.controller'
import { InvalidGameCompletedEventError } from './lobby.errors'
import { GAME_ASSIGNMENT_STORE } from './lobby.interfaces'
import type { IGameAssignmentStore } from './lobby.interfaces'

describe('InternalLobbyController TCP contract', () => {
  it('cleans every assignment after the Game server reports completion', async () => {
    const port = await availablePort()
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()
    const lobbyAuthApp = module.createNestApplication()
    lobbyAuthApp.connectMicroservice<MicroserviceOptions>({
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port },
    })
    await lobbyAuthApp.startAllMicroservices()

    const client = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port },
    })

    try {
      const controller = lobbyAuthApp.get(InternalLobbyController)
      const assignments = lobbyAuthApp.get<IGameAssignmentStore>(
        GAME_ASSIGNMENT_STORE,
      )

      await expect(
        controller.handleGameCompleted({ gameId: ' ' }),
      ).rejects.toBeInstanceOf(InvalidGameCompletedEventError)
      await assignments.assign([
        assignment('account-1', 'game-1'),
        assignment('account-2', 'game-1'),
        assignment('account-3', 'game-2'),
      ])

      await emitGameCompleted(client, { gameId: 'game-1' })
      await waitUntilEmpty(assignments, 'game-1')

      await expect(assignments.findByGameId('game-1')).resolves.toEqual([])
      await expect(assignments.findByGameId('game-2')).resolves.toHaveLength(1)

      // A retried one-way event remains safe after cleanup already finished.
      await emitGameCompleted(client, { gameId: 'game-1' })
      await expect(assignments.findByGameId('game-2')).resolves.toHaveLength(1)
    } finally {
      await client.close()
      await lobbyAuthApp.close()
    }
  })
})

function assignment(accountId: string, gameId: string) {
  return {
    accountId,
    gameId,
    webSocketUrl: 'http://localhost:3001',
    assignedAt: new Date(),
  }
}

function emitGameCompleted(
  client: ReturnType<typeof ClientProxyFactory.create>,
  event: GameCompletedEvent,
): Promise<void> {
  return new Promise((resolve, reject) => {
    client
      .emit<void, GameCompletedEvent>(GAME_COMPLETED_PATTERN, event)
      .subscribe({
        complete: resolve,
        error: reject,
      })
  })
}

async function waitUntilEmpty(
  assignments: IGameAssignmentStore,
  gameId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await assignments.findByGameId(gameId)).length === 0) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`Timed out waiting for ${gameId} cleanup`)
}

async function availablePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Could not allocate a TCP test port')
  }

  await new Promise<void>((resolve) => server.close(() => resolve()))
  return address.port
}
