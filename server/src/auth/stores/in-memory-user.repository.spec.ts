import { InMemoryUserRepository } from './in-memory-user.repository'
import { UserAccount } from '../auth.types'

const account: UserAccount = {
  id: 'account-1',
  username: 'player-one',
  passwordHash: 'argon2id-hash',
  createdAt: new Date('2026-08-20T00:00:00.000Z'),
}

describe('InMemoryUserRepository', () => {
  it('stores and finds an account by id and username', async () => {
    const repository = new InMemoryUserRepository()

    await repository.create(account)

    await expect(repository.findById(account.id)).resolves.toEqual(account)
    await expect(repository.findByUsername(account.username)).resolves.toEqual(
      account,
    )
  })

  it('enforces unique account ids and usernames', async () => {
    const repository = new InMemoryUserRepository()
    await repository.create(account)

    await expect(repository.create(account)).rejects.toThrow(
      'Account id already exists',
    )
    await expect(
      repository.create({ ...account, id: 'account-2' }),
    ).rejects.toThrow('Username already exists')
  })

  it('returns copies so callers cannot mutate stored account data', async () => {
    const repository = new InMemoryUserRepository()
    await repository.create(account)

    const result = await repository.findById(account.id)
    result!.username = 'changed'
    result!.createdAt.setFullYear(2000)

    await expect(repository.findById(account.id)).resolves.toEqual(account)
  })
})
