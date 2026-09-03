import { ClientProxyFactory, Transport } from '@nestjs/microservices'
import type { ClientProxy, MicroserviceOptions } from '@nestjs/microservices'
import { Test } from '@nestjs/testing'
import { createServer } from 'node:net'
import { firstValueFrom } from 'rxjs'
import { CREATE_GAME_PATTERN } from 'shared'
import { NestTcpGameServerClient } from '../lobby/nest-tcp-game-server.client'
import { GameRegistryService } from './game-registry.service'
import { GameServerModule } from './game-server.module'
import { GAME_SERVER_PUBLIC_URL } from './internal-game.controller'

// ---------------------------------------------------------------------------
// The create-game contract, both halves for real: the lobby's own TCP client
// (`lobby/nest-tcp-game-server.client.ts`) dialling this module listening on
// a real socket. Nothing is faked on either side of the wire.
// ---------------------------------------------------------------------------

const PUBLIC_URL = 'http://game.test:3001'

describe('InternalGameController TCP contract', () => {
  let app: Awaited<ReturnType<typeof bootGameServer>>
  let proxy: ClientProxy
  let lobbyClient: NestTcpGameServerClient

  beforeAll(async () => {
    const port = await availablePort()
    app = await bootGameServer(port)
    proxy = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port },
    })
    lobbyClient = new NestTcpGameServerClient(proxy)
  })

  afterAll(async () => {
    await proxy.close()
    await app.close()
  })

  it('deals a table for the lobby and tells it where the seats connect', async () => {
    const result = await lobbyClient.createGame({
      accountIds: ['account-1', 'account-2'],
      gameConfig: 'default',
    })

    expect(typeof result.gameId).toBe('string')
    expect(result.webSocketUrl).toBe(PUBLIC_URL)
    const running = app
      .get<GameRegistryService>(GameRegistryService)
      .get(result.gameId)
    expect(running).toBeDefined()
    expect([...running!.game.playerOrder].sort()).toEqual([
      'account-1',
      'account-2',
    ])
  })

  it('hosts every game created on the one url', async () => {
    const first = await lobbyClient.createGame({
      accountIds: ['account-3', 'account-4'],
      gameConfig: 'default',
    })
    const second = await lobbyClient.createGame({
      accountIds: ['account-5', 'account-6'],
      gameConfig: 'default',
    })

    expect(first.gameId).not.toBe(second.gameId)
    expect(second.webSocketUrl).toBe(first.webSocketUrl)
  })

  it('refuses a malformed request with its reason, without dropping the connection', async () => {
    const wrongShape = await refused({
      accountIds: 'account-1',
      gameConfig: 'default',
    })
    expect(wrongShape).toMatch(/^Invalid create-game request: accountIds: /)

    const unknownConfig = await refused({
      accountIds: ['account-1', 'account-2'],
      gameConfig: 'blitz',
    })
    expect(unknownConfig).toMatch(/^Invalid create-game request: gameConfig: /)
    expect(unknownConfig).toContain('"default"')

    // The same client still creates games afterwards.
    await expect(
      lobbyClient.createGame({
        accountIds: ['account-7', 'account-8'],
        gameConfig: 'default',
      }),
    ).resolves.toMatchObject({ webSocketUrl: PUBLIC_URL })
  })

  it('reports a well-formed request the engine cannot seat as an error', async () => {
    await expect(
      lobbyClient.createGame({
        accountIds: ['account-1'],
        gameConfig: 'default',
      }),
    ).rejects.toBeDefined()
  })

  /** The reason the wire carries back for a request the server would not take. */
  async function refused(request: unknown): Promise<string> {
    const outcome: unknown = await firstValueFrom(
      proxy.send(CREATE_GAME_PATTERN, request),
    ).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(outcome).toMatchObject({ status: 'error' })
    return (outcome as { message: string }).message
  }
})

async function bootGameServer(port: number) {
  const module = await Test.createTestingModule({
    imports: [GameServerModule],
  })
    .overrideProvider(GAME_SERVER_PUBLIC_URL)
    .useValue(PUBLIC_URL)
    .compile()

  const app = module.createNestMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: { host: '127.0.0.1', port },
    logger: false,
  })
  await app.listen()
  return app
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
