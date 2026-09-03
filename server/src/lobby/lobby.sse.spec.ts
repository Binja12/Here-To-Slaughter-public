import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import cookieParser from 'cookie-parser'
import type { ClientRequest, IncomingMessage } from 'node:http'
import { request as httpRequest } from 'node:http'
import type { Server } from 'node:http'
import request, { Response as SupertestResponse } from 'supertest'
import { AppModule } from '../app.module'
import { GAME_SERVER_CLIENT } from './lobby.interfaces'
import type { IGameServerClient } from './lobby.interfaces'
import type { GameAssignedEventData, LobbySnapshot } from './lobby.types'

const PASSWORD = 'correct horse battery staple'

type SseFrame = {
  type: string
  data: unknown
}

describe('Lobby SSE HTTP contract', () => {
  let app: INestApplication
  let httpServer: Server
  let baseUrl: string
  let streams: SseTestClient[]

  beforeEach(async () => {
    const gameServer: jest.Mocked<IGameServerClient> = {
      createGame: jest.fn().mockResolvedValue({
        gameId: 'game-1',
        webSocketUrl: 'http://localhost:3001',
      }),
    }
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GAME_SERVER_CLIENT)
      .useValue(gameServer)
      .compile()

    app = module.createNestApplication()
    app.use(cookieParser())
    await app.listen(0, '127.0.0.1')
    httpServer = app.getHttpServer() as Server
    const address = httpServer.address()
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine the lobby test port')
    }
    baseUrl = `http://127.0.0.1:${address.port}`
    streams = []
  })

  afterEach(async () => {
    for (const stream of streams) stream.close()
    await app.close()
  })

  it('streams initial and caller-specific lobby snapshots', async () => {
    const first = await register(httpServer, 'player-one')
    const second = await register(httpServer, 'player-two')
    const firstStream = await openStream(sessionCookie(first))
    const secondStream = await openStream(sessionCookie(second))

    const firstInitial = asLobbySnapshot(
      (await firstStream.next('lobby-updated')).data,
    )
    const secondInitial = asLobbySnapshot(
      (await secondStream.next('lobby-updated')).data,
    )
    expect(firstInitial.self.state).toBe('IDLE')
    expect(secondInitial.self.state).toBe('IDLE')

    await request(httpServer)
      .post('/lobby/ready')
      .set('Cookie', sessionCookie(first))
      .expect(200)

    const firstUpdate = asLobbySnapshot(
      (await firstStream.next('lobby-updated')).data,
    )
    const secondUpdate = asLobbySnapshot(
      (await secondStream.next('lobby-updated')).data,
    )
    expect(firstUpdate.readyPlayers).toEqual([
      { accountId: responseAccountId(first), username: 'player-one' },
    ])
    expect(firstUpdate.self).toMatchObject({ state: 'READY', isHost: true })
    expect(secondUpdate.readyPlayers).toEqual(firstUpdate.readyPlayers)
    expect(secondUpdate.self).toMatchObject({ state: 'IDLE', isHost: false })
  })

  it('streams game assignments only to selected accounts', async () => {
    const host = await register(httpServer, 'player-one')
    const selected = await register(httpServer, 'player-two')
    const outsider = await register(httpServer, 'player-three')
    await request(httpServer)
      .post('/lobby/ready')
      .set('Cookie', sessionCookie(host))
      .expect(200)
    await request(httpServer)
      .post('/lobby/ready')
      .set('Cookie', sessionCookie(selected))
      .expect(200)

    const selectedStream = await openStream(sessionCookie(selected))
    const outsiderStream = await openStream(sessionCookie(outsider))
    await selectedStream.next('lobby-updated')
    await outsiderStream.next('lobby-updated')

    await request(httpServer)
      .post('/lobby/start-game')
      .set('Cookie', sessionCookie(host))
      .expect(202)

    const selectedUpdate = asLobbySnapshot(
      (await selectedStream.next('lobby-updated')).data,
    )
    const outsiderUpdate = asLobbySnapshot(
      (await outsiderStream.next('lobby-updated')).data,
    )
    const assignment = (await selectedStream.next('game-assigned'))
      .data as GameAssignedEventData

    expect(selectedUpdate.self.state).toBe('IN_GAME')
    expect(outsiderUpdate.self.state).toBe('IDLE')
    expect(assignment).toEqual({
      gameId: 'game-1',
      webSocketUrl: 'http://localhost:3001',
    })
    expect(outsiderStream.received('game-assigned')).toBe(false)
  })

  async function openStream(cookie: string): Promise<SseTestClient> {
    const stream = await SseTestClient.open(`${baseUrl}/lobby/events`, cookie)
    streams.push(stream)
    return stream
  }
})

class SseTestClient {
  private readonly frames: SseFrame[] = []
  private readonly history: SseFrame[] = []
  private readonly waiters: Array<{
    type: string
    resolve: (frame: SseFrame) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
  }> = []
  private buffer = ''

  private constructor(
    private readonly request: ClientRequest,
    private readonly response: IncomingMessage,
  ) {
    response.setEncoding('utf8')
    response.on('data', (chunk: string) => this.read(chunk))
  }

  static open(url: string, cookie: string): Promise<SseTestClient> {
    return new Promise((resolve, reject) => {
      const request = httpRequest(
        url,
        {
          headers: {
            Accept: 'text/event-stream',
            Cookie: cookie,
          },
        },
        (response) => {
          if (response.statusCode !== 200) {
            response.resume()
            reject(new Error(`SSE returned HTTP ${response.statusCode}`))
            return
          }
          resolve(new SseTestClient(request, response))
        },
      )
      request.once('error', reject)
      request.end()
    })
  }

  next(type: string): Promise<SseFrame> {
    const existingIndex = this.frames.findIndex((frame) => frame.type === type)
    if (existingIndex !== -1) {
      return Promise.resolve(this.frames.splice(existingIndex, 1)[0])
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for SSE event ${type}`))
      }, 2_000)
      this.waiters.push({ type, resolve, reject, timer })
    })
  }

  received(type: string): boolean {
    return this.history.some((frame) => frame.type === type)
  }

  close(): void {
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error('SSE connection closed'))
    }
    this.waiters.length = 0
    this.response.destroy()
    this.request.destroy()
  }

  private read(chunk: string): void {
    this.buffer += chunk
    const blocks = this.buffer.split(/\r?\n\r?\n/)
    this.buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      const frame = parseSseFrame(block)
      if (!frame) continue
      this.history.push(frame)

      const waiterIndex = this.waiters.findIndex(
        (waiter) => waiter.type === frame.type,
      )
      if (waiterIndex === -1) {
        this.frames.push(frame)
        continue
      }

      const waiter = this.waiters.splice(waiterIndex, 1)[0]
      clearTimeout(waiter.timer)
      waiter.resolve(frame)
    }
  }
}

function parseSseFrame(block: string): SseFrame | undefined {
  let type = 'message'
  const data: string[] = []

  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) type = line.slice('event:'.length).trim()
    if (line.startsWith('data:')) data.push(line.slice('data:'.length).trim())
  }
  if (data.length === 0) return undefined
  return { type, data: JSON.parse(data.join('\n')) as unknown }
}

function asLobbySnapshot(value: unknown): LobbySnapshot {
  return value as LobbySnapshot
}

function register(server: Server, username: string) {
  return request(server)
    .post('/register')
    .send({ username, password: PASSWORD })
}

function responseAccountId(response: SupertestResponse): string {
  const body = response.body as unknown
  if (
    !body ||
    typeof body !== 'object' ||
    !('accountId' in body) ||
    typeof body.accountId !== 'string'
  ) {
    throw new Error('Response did not contain an account id')
  }
  return body.accountId
}

function sessionCookie(response: SupertestResponse): string {
  const cookies = response.headers['set-cookie']
  if (!cookies?.[0]) throw new Error('Response did not set a cookie')
  return cookies[0].split(';', 1)[0]
}
