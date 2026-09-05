import { Module } from '@nestjs/common'
import { SESSION_STORE, USER_REPOSITORY } from '../auth/auth.interfaces'
import { InMemorySessionStore } from '../auth/stores/in-memory-session.store'
import { InMemoryUserRepository } from '../auth/stores/in-memory-user.repository'
import { GAME_STORE } from '../game-server/game.store'
import { InMemoryGameStore } from '../game-server/stores/in-memory-game.store'
import { GAME_ASSIGNMENT_STORE, LOBBY_STORE } from '../lobby/lobby.interfaces'
import { InMemoryGameAssignmentStore } from '../lobby/stores/in-memory-game-assignment.store'
import { InMemoryLobbyStore } from '../lobby/stores/in-memory-lobby.store'
import { DatabaseModule } from '../persistence/database.module'
import { PostgresGameStore } from '../persistence/postgres-game.store'
import { PostgresUserRepository } from '../persistence/postgres-user.repository'

// ---------------------------------------------------------------------------
// Every store behind its interface token, chosen once at load: with
// `DATABASE_URL` set, accounts and games live in Postgres; without it — a
// spec, a dev run with no database — everything stays in this process.
// Sessions, the ready list and the seat assignments are in memory either
// way: a restart logs everyone out and empties the lobby, and the game
// process resolves sessions through the lobby's TCP door regardless
// (docs/API_AND_SOCKETS_CONTRACT.md §2).
// ---------------------------------------------------------------------------

const persistent = Boolean(process.env.DATABASE_URL)

@Module({
  imports: persistent ? [DatabaseModule] : [],
  providers: [
    {
      provide: USER_REPOSITORY,
      useClass: persistent ? PostgresUserRepository : InMemoryUserRepository,
    },
    { provide: SESSION_STORE, useClass: InMemorySessionStore },
    { provide: LOBBY_STORE, useClass: InMemoryLobbyStore },
    { provide: GAME_ASSIGNMENT_STORE, useClass: InMemoryGameAssignmentStore },
    {
      provide: GAME_STORE,
      useClass: persistent ? PostgresGameStore : InMemoryGameStore,
    },
  ],
  exports: [
    USER_REPOSITORY,
    SESSION_STORE,
    LOBBY_STORE,
    GAME_ASSIGNMENT_STORE,
    GAME_STORE,
  ],
})
export class StoresModule {}
