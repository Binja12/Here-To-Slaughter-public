import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import cookieParser from 'cookie-parser'
import request, { Response as SupertestResponse } from 'supertest'
import { AppModule } from '../app.module'
import { GAME_SERVER_CLIENT } from './lobby.interfaces'
import type { IGameServerClient } from './lobby.interfaces'

const PASSWORD = 'correct horse battery staple'

describe('Lobby HTTP contract', () => {
  let app: INestApplication
  let gameServer: jest.Mocked<IGameServerClient>

  beforeEach(async () => {
    gameServer = {
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
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  it('rejects unauthenticated API requests instead of redirecting them', async () => {
    const response = await request(app.getHttpServer())
      .get('/lobby')
      .set('Accept', 'application/json')

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ reason: 'Authentication required' })
  })

  it('protects the lobby SSE stream with the session guard', async () => {
    const response = await request(app.getHttpServer())
      .get('/lobby/events')
      .set('Accept', 'text/event-stream')

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ reason: 'Authentication required' })
  })

  it('returns the caller snapshot and supports ready and unready', async () => {
    const first = await register(app, 'player-one')
    const firstCookie = sessionCookie(first)

    const idle = await request(app.getHttpServer())
      .get('/lobby')
      .set('Cookie', firstCookie)
    expect(idle.status).toBe(200)
    expect(idle.body.self).toMatchObject({
      accountId: first.body.accountId,
      username: 'player-one',
      state: 'IDLE',
      isHost: false,
    })
    expect(idle.body.settings).toEqual({ gameConfig: 'default' })

    const ready = await request(app.getHttpServer())
      .post('/lobby/ready')
      .set('Cookie', firstCookie)
    expect(ready.status).toBe(200)
    expect(ready.body.self).toMatchObject({ state: 'READY', isHost: true })

    const unready = await request(app.getHttpServer())
      .delete('/lobby/ready')
      .set('Cookie', firstCookie)
    expect(unready.status).toBe(200)
    expect(unready.body.self).toMatchObject({ state: 'IDLE', isHost: false })
  })

  it('preserves host order across different authenticated accounts', async () => {
    const first = await register(app, 'player-one')
    const second = await register(app, 'player-two')

    await request(app.getHttpServer())
      .post('/lobby/ready')
      .set('Cookie', sessionCookie(first))
      .expect(200)
    const secondReady = await request(app.getHttpServer())
      .post('/lobby/ready')
      .set('Cookie', sessionCookie(second))

    expect(
      secondReady.body.readyPlayers.map(
        (player: { accountId: string }) => player.accountId,
      ),
    ).toEqual([first.body.accountId, second.body.accountId])
    expect(secondReady.body.self.isHost).toBe(false)

    await request(app.getHttpServer())
      .delete('/lobby/ready')
      .set('Cookie', sessionCookie(first))
      .expect(200)
    const secondSnapshot = await request(app.getHttpServer())
      .get('/lobby')
      .set('Cookie', sessionCookie(second))
    expect(secondSnapshot.body.self.isHost).toBe(true)
  })

  it('starts a game through the client and moves selected players in-game', async () => {
    const first = await register(app, 'player-one')
    const second = await register(app, 'player-two')
    const firstCookie = sessionCookie(first)
    const secondCookie = sessionCookie(second)

    await request(app.getHttpServer())
      .post('/lobby/ready')
      .set('Cookie', firstCookie)
      .expect(200)
    await request(app.getHttpServer())
      .post('/lobby/ready')
      .set('Cookie', secondCookie)
      .expect(200)

    const response = await request(app.getHttpServer())
      .post('/lobby/start-game')
      .set('Cookie', firstCookie)

    expect(response.status).toBe(202)
    expect(response.body).toEqual({ gameId: 'game-1', status: 'STARTING' })
    expect(gameServer.createGame).toHaveBeenCalledWith({
      accountIds: [first.body.accountId, second.body.accountId],
      gameConfig: 'default',
    })

    const secondSnapshot = await request(app.getHttpServer())
      .get('/lobby')
      .set('Cookie', secondCookie)
    expect(secondSnapshot.body.readyPlayers).toEqual([])
    expect(secondSnapshot.body.self.state).toBe('IN_GAME')
  })

  it('returns 503 and keeps the ready group when creation fails', async () => {
    const first = await register(app, 'player-one')
    const second = await register(app, 'player-two')
    const firstCookie = sessionCookie(first)

    await request(app.getHttpServer())
      .post('/lobby/ready')
      .set('Cookie', firstCookie)
      .expect(200)
    await request(app.getHttpServer())
      .post('/lobby/ready')
      .set('Cookie', sessionCookie(second))
      .expect(200)
    gameServer.createGame.mockRejectedValue(new Error('connection refused'))

    const response = await request(app.getHttpServer())
      .post('/lobby/start-game')
      .set('Cookie', firstCookie)
    expect(response.status).toBe(503)
    expect(response.body).toEqual({ reason: 'Game server is unavailable' })

    const snapshot = await request(app.getHttpServer())
      .get('/lobby')
      .set('Cookie', firstCookie)
    expect(snapshot.body.readyPlayers).toHaveLength(2)
    expect(snapshot.body.self.state).toBe('READY')
  })
})

function register(app: INestApplication, username: string) {
  return request(app.getHttpServer())
    .post('/register')
    .send({ username, password: PASSWORD })
}

function sessionCookie(response: SupertestResponse): string {
  const cookies = response.headers['set-cookie']
  if (!cookies?.[0]) throw new Error('Response did not set a cookie')
  return cookies[0].split(';', 1)[0]
}
