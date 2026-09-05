/**
 * The module reads `DATABASE_URL` when it loads, so each case loads it fresh
 * under the environment it wants. The Postgres side is proven against a real
 * database in `persistence/postgres.spec.ts`.
 */
export async function loadStores(databaseUrl: string | undefined) {
  const previous = process.env.DATABASE_URL
  if (databaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = databaseUrl
  try {
    let loaded!: Promise<Record<string, string>>
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      // The tokens too: an isolated registry mints its own symbols.
      const { Test } = require('@nestjs/testing')
      const { StoresModule } = require('./stores.module')
      const { SESSION_STORE, USER_REPOSITORY } = require('../auth/auth.interfaces')
      const { GAME_STORE } = require('../game-server/game.store')
      const { GAME_ASSIGNMENT_STORE, LOBBY_STORE } = require('../lobby/lobby.interfaces')
      /* eslint-enable @typescript-eslint/no-require-imports */
      loaded = (async () => {
        const module = await Test.createTestingModule({
          imports: [StoresModule],
        }).compile()
        const named = (token: symbol) => module.get(token).constructor.name as string
        const names = {
          users: named(USER_REPOSITORY),
          sessions: named(SESSION_STORE),
          lobby: named(LOBBY_STORE),
          assignments: named(GAME_ASSIGNMENT_STORE),
          games: named(GAME_STORE),
        }
        await module.close()
        return names
      })()
    })
    return await loaded
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previous
  }
}
