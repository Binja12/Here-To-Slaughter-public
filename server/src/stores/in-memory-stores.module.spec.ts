import { Test } from '@nestjs/testing'
import { SESSION_STORE, USER_REPOSITORY } from '../auth/auth.interfaces'
import { InMemorySessionStore } from '../auth/stores/in-memory-session.store'
import { InMemoryUserRepository } from '../auth/stores/in-memory-user.repository'
import { GAME_ASSIGNMENT_STORE, LOBBY_STORE } from '../lobby/lobby.interfaces'
import { InMemoryGameAssignmentStore } from '../lobby/stores/in-memory-game-assignment.store'
import { InMemoryLobbyStore } from '../lobby/stores/in-memory-lobby.store'
import { InMemoryStoresModule } from './in-memory-stores.module'

describe('InMemoryStoresModule', () => {
  it('provides every store through its interface token', async () => {
    const module = await Test.createTestingModule({
      imports: [InMemoryStoresModule],
    }).compile()

    expect(module.get(USER_REPOSITORY)).toBeInstanceOf(InMemoryUserRepository)
    expect(module.get(SESSION_STORE)).toBeInstanceOf(InMemorySessionStore)
    expect(module.get(LOBBY_STORE)).toBeInstanceOf(InMemoryLobbyStore)
    expect(module.get(GAME_ASSIGNMENT_STORE)).toBeInstanceOf(
      InMemoryGameAssignmentStore,
    )

    await module.close()
  })
})
