import { InMemorySessionStore } from './in-memory-session.store'
import { Session } from '../auth.types'

function session(overrides: Partial<Session> = {}): Session {
  return {
    tokenHash: 'hashed-token-1',
    accountId: 'account-1',
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  }
}

describe('InMemorySessionStore', () => {
  it('stores sessions by token hash without requiring a plaintext token', async () => {
    const store = new InMemorySessionStore()
    const value = session()

    await store.create(value)

    await expect(store.findByTokenHash(value.tokenHash)).resolves.toEqual(value)
  })

  it('does not resolve expired sessions and removes them', async () => {
    const store = new InMemorySessionStore()
    const value = session({ expiresAt: new Date(Date.now() - 1) })
    await store.create(value)

    await expect(
      store.findByTokenHash(value.tokenHash),
    ).resolves.toBeUndefined()
    await expect(store.revoke(value.tokenHash)).resolves.toBe(false)
  })

  it('revokes one session or all sessions for an account', async () => {
    const store = new InMemorySessionStore()
    await store.create(session())
    await store.create(session({ tokenHash: 'hashed-token-2' }))
    await store.create(
      session({ tokenHash: 'hashed-token-3', accountId: 'account-2' }),
    )

    await expect(store.revoke('hashed-token-1')).resolves.toBe(true)
    await expect(store.revokeAllForAccount('account-1')).resolves.toBe(1)
    await expect(store.findByTokenHash('hashed-token-3')).resolves.toBeDefined()
  })

  it('rejects duplicate token hashes', async () => {
    const store = new InMemorySessionStore()
    await store.create(session())

    await expect(store.create(session())).rejects.toThrow(
      'Session token hash already exists',
    )
  })
})
