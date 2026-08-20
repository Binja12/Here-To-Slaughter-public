import { Injectable } from '@nestjs/common'
import { SessionTokenHashAlreadyExistsError } from '../auth.errors'
import { ISessionStore } from '../auth.interfaces'
import { Session } from '../auth.types'

@Injectable()
export class InMemorySessionStore implements ISessionStore {
  private readonly sessionsByTokenHash = new Map<string, Session>()

  async create(session: Session): Promise<void> {
    // A token hash identifies exactly one session.
    if (this.sessionsByTokenHash.has(session.tokenHash)) {
      throw new SessionTokenHashAlreadyExistsError()
    }

    // The map stores the token hash, never the browser's plaintext token.
    this.sessionsByTokenHash.set(session.tokenHash, cloneSession(session))
  }

  async findByTokenHash(tokenHash: string): Promise<Session | undefined> {
    const session = this.sessionsByTokenHash.get(tokenHash)
    if (!session) return undefined

    // Expired sessions no longer resolve and are removed while reading.
    if (session.expiresAt.getTime() <= Date.now()) {
      this.sessionsByTokenHash.delete(tokenHash)
      return undefined
    }

    // Return a copy so callers cannot mutate the stored dates.
    return cloneSession(session)
  }

  async revoke(tokenHash: string): Promise<boolean> {
    return this.sessionsByTokenHash.delete(tokenHash)
  }

  async revokeAllForAccount(accountId: string): Promise<number> {
    let revoked = 0

    // Remove every browser session owned by this account.
    for (const [tokenHash, session] of this.sessionsByTokenHash) {
      if (session.accountId === accountId) {
        this.sessionsByTokenHash.delete(tokenHash)
        revoked += 1
      }
    }
    return revoked
  }
}

function cloneSession(session: Session): Session {
  return {
    ...session,
    createdAt: new Date(session.createdAt),
    expiresAt: new Date(session.expiresAt),
  }
}
