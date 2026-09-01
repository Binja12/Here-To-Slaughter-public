import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import * as argon2 from 'argon2'
import cookieParser from 'cookie-parser'
import request, { Response as SupertestResponse } from 'supertest'
import { AuthModule } from './auth.module'
import {
  ISessionStore,
  IUserRepository,
  SESSION_STORE,
  USER_REPOSITORY,
} from './auth.interfaces'
import {
  GAME_ASSIGNMENT_STORE,
  IGameAssignmentStore,
} from '../lobby/lobby.interfaces'
import { hashSessionToken } from './auth.service'
import { CurrentAccount, SessionAuthGuard } from './session-auth.guard'
import { SESSION_COOKIE_NAME } from './session-cookie'
import type { AuthenticatedAccount } from './auth.types'

const PASSWORD = 'correct horse battery staple'

@Controller('test/protected')
@UseGuards(SessionAuthGuard)
class ProtectedTestController {
  @Get()
  getAccount(
    @CurrentAccount() account: AuthenticatedAccount,
  ): AuthenticatedAccount {
    return account
  }
}

describe('Auth HTTP contract', () => {
  let app: INestApplication

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [ProtectedTestController],
    }).compile()

    app = module.createNestApplication()
    app.use(cookieParser())
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  it('registers, hashes the password, and creates a one-month session', async () => {
    const response = await register(app, 'player-one')

    expect(response.status).toBe(201)
    expect(response.body).toEqual({
      accountId: expect.any(String),
      username: 'player-one',
    })

    const users = app.get<IUserRepository>(USER_REPOSITORY)
    const account = await users.findByUsername('player-one')
    expect(account).toBeDefined()
    expect(account!.passwordHash).not.toBe(PASSWORD)
    await expect(argon2.verify(account!.passwordHash, PASSWORD)).resolves.toBe(
      true,
    )

    const cookie = sessionCookie(response)
    expect(cookie.full).toContain('HttpOnly')
    expect(cookie.full).toContain('SameSite=Lax')
    expect(cookie.full).toContain('Path=/')

    const sessions = app.get<ISessionStore>(SESSION_STORE)
    const storedSession = await sessions.findByTokenHash(
      hashSessionToken(cookie.token),
    )
    expect(storedSession?.accountId).toBe(account!.id)
    expect(
      storedSession!.expiresAt.getTime() - storedSession!.createdAt.getTime(),
    ).toBe(30 * 24 * 60 * 60 * 1000)
  })

  it('rejects a duplicate username', async () => {
    await register(app, 'player-one')

    const response = await request(app.getHttpServer())
      .post('/register')
      .send({ username: 'player-one', password: PASSWORD })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ reason: 'Username already exists' })
  })

  it('logs in with valid credentials and rejects invalid credentials', async () => {
    await register(app, 'player-one')

    const valid = await request(app.getHttpServer())
      .post('/login')
      .send({ username: 'player-one', password: PASSWORD })
    expect(valid.status).toBe(200)
    expect(valid.body.username).toBe('player-one')
    expect(sessionCookie(valid).token).toBeTruthy()

    const invalid = await request(app.getHttpServer())
      .post('/login')
      .send({ username: 'player-one', password: 'wrong password' })
    expect(invalid.status).toBe(401)
    expect(invalid.body).toEqual({
      reason: 'Invalid username or password',
    })
  })

  it('revokes the session and clears the cookie on logout', async () => {
    const registration = await register(app, 'player-one')
    const cookie = sessionCookie(registration)

    const response = await request(app.getHttpServer())
      .post('/logout')
      .set('Cookie', cookie.pair)

    expect(response.status).toBe(204)
    expect(response.text).toBe('')
    expect(firstSetCookie(response)).toContain(`${SESSION_COOKIE_NAME}=;`)

    const sessions = app.get<ISessionStore>(SESSION_STORE)
    await expect(
      sessions.findByTokenHash(hashSessionToken(cookie.token)),
    ).resolves.toBeUndefined()
  })

  it('logs out only the presented session', async () => {
    const registration = await register(app, 'player-one')
    const firstCookie = sessionCookie(registration)
    const secondLogin = await request(app.getHttpServer())
      .post('/login')
      .send({ username: 'player-one', password: PASSWORD })
    const secondCookie = sessionCookie(secondLogin)

    await request(app.getHttpServer())
      .post('/logout')
      .set('Cookie', firstCookie.pair)
      .expect(204)

    await request(app.getHttpServer())
      .get('/test/protected')
      .set('Cookie', firstCookie.pair)
      .expect(401)
    const stillAuthenticated = await request(app.getHttpServer())
      .get('/test/protected')
      .set('Cookie', secondCookie.pair)
      .expect(200)
    expect(stillAuthenticated.body.accountId).toBe(registration.body.accountId)
  })

  it('rejects malformed registration and login bodies', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/register')
      .send({ username: 'player-one' })
    const loginResponse = await request(app.getHttpServer())
      .post('/login')
      .send({ username: 123, password: PASSWORD })

    expect(registerResponse.status).toBe(400)
    expect(registerResponse.body).toEqual({
      reason: 'Username and password are required',
    })
    expect(loginResponse.status).toBe(400)
  })

  it('guards protected API routes with the session cookie', async () => {
    const unauthenticated = await request(app.getHttpServer()).get(
      '/test/protected',
    )
    expect(unauthenticated.status).toBe(401)
    expect(unauthenticated.body).toEqual({
      reason: 'Authentication required',
    })

    const registration = await register(app, 'player-one')
    const authenticated = await request(app.getHttpServer())
      .get('/test/protected')
      .set('Cookie', sessionCookie(registration).pair)

    expect(authenticated.status).toBe(200)
    expect(authenticated.body).toEqual({
      accountId: registration.body.accountId,
      username: 'player-one',
    })
  })

  it('redirects page navigation based on authentication', async () => {
    const unauthenticated = await request(app.getHttpServer())
      .get('/any-application-page')
      .set('Accept', 'text/html')
    expect(unauthenticated.status).toBe(302)
    expect(unauthenticated.headers.location).toBe('/login')

    const rootNavigation = await request(app.getHttpServer())
      .get('/')
      .set('Accept', 'text/html')
    expect(rootNavigation.status).toBe(302)
    expect(rootNavigation.headers.location).toBe('/login')

    const registration = await register(app, 'player-one')
    const authenticated = await request(app.getHttpServer())
      .get('/login')
      .set('Accept', 'text/html')
      .set('Cookie', sessionCookie(registration).pair)
    expect(authenticated.status).toBe(302)
    expect(authenticated.headers.location).toBe('/lobby')
  })

  it('redirects an assigned account to its active game', async () => {
    const registration = await register(app, 'player-one')
    const assignments = app.get<IGameAssignmentStore>(GAME_ASSIGNMENT_STORE)
    await assignments.assign([
      {
        accountId: registration.body.accountId,
        gameId: 'game-1',
        webSocketUrl: 'http://localhost:3001',
        assignedAt: new Date(),
      },
    ])

    const response = await request(app.getHttpServer())
      .get('/login')
      .set('Accept', 'text/html')
      .set('Cookie', sessionCookie(registration).pair)

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe('/game/game-1')
  })
})

async function register(app: INestApplication, username: string) {
  return request(app.getHttpServer())
    .post('/register')
    .send({ username, password: PASSWORD })
}

function sessionCookie(response: SupertestResponse) {
  const full = firstSetCookie(response)
  const pair = full.split(';', 1)[0]
  const token = pair.slice(`${SESSION_COOKIE_NAME}=`.length)
  return { full, pair, token }
}

function firstSetCookie(response: SupertestResponse): string {
  const cookies = response.headers['set-cookie']
  if (!cookies?.[0]) throw new Error('Response did not set a cookie')
  return cookies[0]
}
