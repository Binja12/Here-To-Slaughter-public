import { loadStores } from './spec-helpers'

describe('StoresModule', () => {
  it('keeps every store in memory when no DATABASE_URL is set', async () => {
    await expect(loadStores(undefined)).resolves.toEqual({
      users: 'InMemoryUserRepository',
      sessions: 'InMemorySessionStore',
      lobby: 'InMemoryLobbyStore',
      assignments: 'InMemoryGameAssignmentStore',
      games: 'InMemoryGameStore',
    })
  })
})
