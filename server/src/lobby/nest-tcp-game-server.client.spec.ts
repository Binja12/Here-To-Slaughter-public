import { Controller, Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import {
  ClientProxyFactory,
  MessagePattern,
  Transport,
} from '@nestjs/microservices'
import type { MicroserviceOptions } from '@nestjs/microservices'
import { createServer } from 'node:net'
import { CREATE_GAME_PATTERN } from 'shared'
import type { CreateGameRequest, CreateGameResult } from 'shared'
import { NestTcpGameServerClient } from './nest-tcp-game-server.client'

let receivedRequest: CreateGameRequest | undefined

@Controller()
class FakeGameServerController {
  @MessagePattern(CREATE_GAME_PATTERN)
  createGame(request: CreateGameRequest): CreateGameResult {
    receivedRequest = request
    return {
      gameId: 'tcp-game-1',
      webSocketUrl: 'http://localhost:3001',
    }
  }
}

@Module({ controllers: [FakeGameServerController] })
class FakeGameServerModule {}

describe('NestTcpGameServerClient', () => {
  it('creates a game through a temporary Nest TCP server', async () => {
    const port = await availablePort()
    const gameServer =
      await NestFactory.createMicroservice<MicroserviceOptions>(
        FakeGameServerModule,
        {
          transport: Transport.TCP,
          options: { host: '127.0.0.1', port },
          logger: false,
        },
      )
    await gameServer.listen()

    const proxy = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port },
    })
    const client = new NestTcpGameServerClient(proxy)

    try {
      await expect(
        client.createGame({
          accountIds: ['account-1', 'account-2'],
          gameConfig: 'default',
        }),
      ).resolves.toEqual({
        gameId: 'tcp-game-1',
        webSocketUrl: 'http://localhost:3001',
      })
      expect(receivedRequest).toEqual({
        accountIds: ['account-1', 'account-2'],
        gameConfig: 'default',
      })
    } finally {
      await proxy.close()
      await gameServer.close()
    }
  })
})

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
