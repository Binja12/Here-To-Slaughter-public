import { GameAssignment } from '../lobby.types'
import { InMemoryGameAssignmentStore } from './in-memory-game-assignment.store'

function assignment(accountId: string, gameId = 'game-1'): GameAssignment {
  return {
    accountId,
    gameId,
    webSocketUrl: 'http://localhost:3001',
    assignedAt: new Date('2026-08-20T00:00:00.000Z'),
  }
}

describe('InMemoryGameAssignmentStore', () => {
  it('atomically assigns and finds a group by account or game', async () => {
    const store = new InMemoryGameAssignmentStore()
    const assignments = [assignment('account-1'), assignment('account-2')]

    await store.assign(assignments)

    await expect(store.findByAccountId('account-1')).resolves.toEqual(
      assignments[0],
    )
    await expect(store.findByGameId('game-1')).resolves.toEqual(assignments)
  })

  it('keeps stored assignments isolated from caller mutations', async () => {
    const store = new InMemoryGameAssignmentStore()
    const original = assignment('account-1')
    await store.assign([original])

    original.webSocketUrl = 'changed-by-caller'
    original.assignedAt.setFullYear(1999)
    const firstRead = await store.findByAccountId('account-1')
    firstRead!.webSocketUrl = 'changed-after-read'
    firstRead!.assignedAt.setFullYear(1998)

    await expect(store.findByAccountId('account-1')).resolves.toEqual(
      assignment('account-1'),
    )
  })

  it('rejects the whole batch if an account already has an active game', async () => {
    const store = new InMemoryGameAssignmentStore()
    await store.assign([assignment('account-1')])

    await expect(
      store.assign([
        assignment('account-2', 'game-2'),
        assignment('account-1', 'game-2'),
      ]),
    ).rejects.toThrow('Account already has an active game')
    await expect(store.findByAccountId('account-2')).resolves.toBeUndefined()
  })

  it('removes one assignment or every assignment for a completed game', async () => {
    const store = new InMemoryGameAssignmentStore()
    await store.assign([
      assignment('account-1'),
      assignment('account-2'),
      assignment('account-3', 'game-2'),
    ])

    await expect(store.removeByAccountId('account-1')).resolves.toBe(true)
    await expect(store.removeByGameId('game-1')).resolves.toBe(1)
    await expect(store.findByGameId('game-1')).resolves.toEqual([])
    await expect(store.findByGameId('game-2')).resolves.toHaveLength(1)
  })
})
