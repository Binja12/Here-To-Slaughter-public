import { Inject, Injectable } from '@nestjs/common'
import * as argon2 from 'argon2'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { ISessionStore, IUserRepository } from './auth.interfaces'
import { SESSION_STORE, USER_REPOSITORY } from './auth.interfaces'
import type {
  AuthenticatedAccount,
  AuthSession,
  Session,
  UserAccount,
} from './auth.types'
import {
  InvalidAuthInputError,
  InvalidCredentialsError,
  UsernameAlreadyExistsError,
} from './auth.errors'

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: IUserRepository,
    @Inject(SESSION_STORE)
    private readonly sessions: ISessionStore,
  ) {}

  async register(username: string, password: string): Promise<AuthSession> {
    const normalizedUsername = validateCredentials(username, password)

    // Reject a duplicate username before doing the expensive password hash.
    if (await this.users.findByUsername(normalizedUsername)) {
      throw new UsernameAlreadyExistsError()
    }

    // Persist only the Argon2id hash; the plaintext password is not retained.
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
    const account: UserAccount = {
      id: randomUUID(),
      username: normalizedUsername,
      passwordHash,
      createdAt: new Date(),
    }
    await this.users.create(account)

    // Registration also logs the new account in.
    return this.createSession(account)
  }

  async login(username: string, password: string): Promise<AuthSession> {
    const normalizedUsername = validateCredentials(username, password)
    const account = await this.users.findByUsername(normalizedUsername)

    // Use one public failure for an unknown username or an incorrect password.
    if (!account || !(await argon2.verify(account.passwordHash, password))) {
      throw new InvalidCredentialsError()
    }

    return this.createSession(account)
  }

  async logout(token: string | undefined): Promise<void> {
    // Logout remains successful when the cookie is missing or already revoked.
    if (!token) return
    await this.sessions.revoke(hashSessionToken(token))
  }

  async resolveAccount(
    token: string | undefined,
  ): Promise<AuthenticatedAccount | undefined> {
    if (!token) return undefined

    // Resolve the opaque browser token to its unexpired server-side session.
    const tokenHash = hashSessionToken(token)
    const session = await this.sessions.findByTokenHash(tokenHash)
    if (!session) return undefined

    // Resolve the session's account id instead of trusting client account data.
    const account = await this.users.findById(session.accountId)
    if (!account) {
      // Remove an orphaned session if its account no longer exists.
      await this.sessions.revoke(tokenHash)
      return undefined
    }

    return { accountId: account.id, username: account.username }
  }

  private async createSession(account: UserAccount): Promise<AuthSession> {
    // Send the opaque token to the browser, but store only its SHA-256 hash.
    const token = randomBytes(32).toString('base64url')
    const createdAt = new Date()
    const expiresAt = new Date(createdAt.getTime() + SESSION_DURATION_MS)
    const session: Session = {
      tokenHash: hashSessionToken(token),
      accountId: account.id,
      createdAt,
      expiresAt,
    }
    await this.sessions.create(session)

    return {
      accountId: account.id,
      username: account.username,
      token,
      expiresAt,
    }
  }
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function validateCredentials(username: string, password: string): string {
  const normalizedUsername = username.trim()
  if (!normalizedUsername || !password) {
    throw new InvalidAuthInputError()
  }
  return normalizedUsername
}
