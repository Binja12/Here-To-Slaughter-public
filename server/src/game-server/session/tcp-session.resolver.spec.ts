import { ClientProxyFactory, Transport } from '@nestjs/microservices'
import type { ClientProxy, MicroserviceOptions } from '@nestjs/microservices'
import { Test } from '@nestjs/testing'
import { createServer } from 'node:net'
import { AppModule } from '../../app.module'
import { AuthService } from '../../auth/auth.service'
import { TcpSessionResolver } from './tcp-session.resolver'

// ---------------------------------------------------------------------------
// The resolve-session contract, both halves for real: this resolver dialling
// the lobby/auth process's own `InternalAuthController` listening on a real
// TCP port, with sessions minted by the same `AuthService` the HTTP login
// uses. Nothing is faked on either side of the wire.
// ---------------------------------------------------------------------------

describe('TcpSessionResolver', () => {
  let lobbyAuthApp: Awaited<ReturnType<typeof bootLobbyAuth>>
  let proxy: ClientProxy
  let resolver: TcpSessionResolver
  let auth: AuthService

  beforeAll(async () => {
    const port = await availablePort()
    lobbyAuthApp = await bootLobbyAuth(port)
    proxy = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port },
    })
    resolver = new TcpSessionResolver(proxy)
    auth = lobbyAuthApp.get(AuthService)
  })

  afterAll(async () => {
    await proxy.close()
    await lobbyAuthApp.close()
  })

  it('resolves a live session to the account that logged in', async () => {
    const session = await auth.register('alice', 'correct horse battery staple')

    await expect(resolver.resolve(session.token)).resolves.toEqual({
      accountId: session.accountId,
      username: 'alice',
    })
  })

  it('answers nobody for a revoked or unknown token — expected, not an error', async () => {
    const session = await auth.register('bob', 'correct horse battery staple')
    await auth.logout(session.token)

    await expect(resolver.resolve(session.token)).resolves.toBeUndefined()
    await expect(resolver.resolve('no-such-token')).resolves.toBeUndefined()
  })

  it('throws when the lobby cannot be reached: an outage is not a refusal', async () => {
    const nobodyListening = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port: await availablePort() },
    })
    const unreachable = new TcpSessionResolver(nobodyListening)

    try {
      await expect(unreachable.resolve('any-token')).rejects.toBeDefined()
    } finally {
      await nobodyListening.close()
    }
  })
})

/** The lobby/auth process as `main.ts` builds it, minus its HTTP listener. */
async function bootLobbyAuth(port: number) {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()

  const app = module.createNestApplication({ logger: false })
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: { host: '127.0.0.1', port },
  })
  await app.startAllMicroservices()
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
