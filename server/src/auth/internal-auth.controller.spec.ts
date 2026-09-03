import { ClientProxyFactory, Transport } from '@nestjs/microservices'
import type { MicroserviceOptions } from '@nestjs/microservices'
import { Test } from '@nestjs/testing'
import { createServer } from 'node:net'
import { firstValueFrom } from 'rxjs'
import { RESOLVE_SESSION_PATTERN } from 'shared'
import type { ResolveSessionRequest, ResolveSessionResult } from 'shared'
import { AppModule } from '../app.module'
import { AuthService } from './auth.service'

describe('InternalAuthController TCP contract', () => {
  it('resolves valid sessions and rejects revoked or unknown tokens', async () => {
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
      // This is the same AuthService used by both HTTP and TCP controllers.
      const auth = lobbyAuthApp.get(AuthService)
      const session = await auth.register(
        'game-server-player',
        'correct horse battery staple',
      )

      await expect(resolveSession(client, session.token)).resolves.toEqual({
        authenticated: true,
        accountId: session.accountId,
        username: session.username,
      })

      await auth.logout(session.token)
      await expect(resolveSession(client, session.token)).resolves.toEqual({
        authenticated: false,
      })
      await expect(resolveSession(client, 'unknown-token')).resolves.toEqual({
        authenticated: false,
      })
    } finally {
      await client.close()
      await lobbyAuthApp.close()
    }
  })
})

function resolveSession(
  client: ReturnType<typeof ClientProxyFactory.create>,
  sessionToken: string,
): Promise<ResolveSessionResult> {
  return firstValueFrom(
    client.send<ResolveSessionResult, ResolveSessionRequest>(
      RESOLVE_SESSION_PATTERN,
      { sessionToken },
    ),
  )
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
