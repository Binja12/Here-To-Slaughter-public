import { Module } from '@nestjs/common'
import { SESSION_STORE, USER_REPOSITORY } from '../auth/auth.interfaces'
import { InMemorySessionStore } from '../auth/stores/in-memory-session.store'
import { InMemoryUserRepository } from '../auth/stores/in-memory-user.repository'
import { GAME_ASSIGNMENT_STORE, LOBBY_STORE } from '../lobby/lobby.interfaces'
import { InMemoryGameAssignmentStore } from '../lobby/stores/in-memory-game-assignment.store'
import { InMemoryLobbyStore } from '../lobby/stores/in-memory-lobby.store'

const providers = [
  { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
  { provide: SESSION_STORE, useClass: InMemorySessionStore },
  { provide: LOBBY_STORE, useClass: InMemoryLobbyStore },
  { provide: GAME_ASSIGNMENT_STORE, useClass: InMemoryGameAssignmentStore },
]

@Module({
  providers,
  exports: [USER_REPOSITORY, SESSION_STORE, LOBBY_STORE, GAME_ASSIGNMENT_STORE],
})
export class InMemoryStoresModule {}
