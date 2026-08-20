import { Injectable } from '@nestjs/common'
import { IUserRepository } from '../auth.interfaces'
import { UserAccount } from '../auth.types'

@Injectable()
export class InMemoryUserRepository implements IUserRepository {
  private readonly accountsById = new Map<string, UserAccount>()

  async create(account: UserAccount): Promise<void> {
    // Do not allow two accounts to share the same id.
    if (this.accountsById.has(account.id)) {
      throw new Error(`Account id already exists: ${account.id}`)
    }

    // Usernames must also be unique.
    if (this.findStoredByUsername(account.username)) {
      throw new Error(`Username already exists: ${account.username}`)
    }

    // Store one copy of the account, indexed by its id.
    const stored = cloneAccount(account)
    this.accountsById.set(stored.id, stored)
  }

  async findById(accountId: string): Promise<UserAccount | undefined> {
    const account = this.accountsById.get(accountId)

    // Return a copy so callers cannot change the stored account by reference.
    return account ? cloneAccount(account) : undefined
  }

  async findByUsername(username: string): Promise<UserAccount | undefined> {
    const account = this.findStoredByUsername(username)

    // Return a copy so callers cannot change the stored account by reference.
    return account ? cloneAccount(account) : undefined
  }

  private findStoredByUsername(username: string): UserAccount | undefined {
    // Search the stored accounts without maintaining a duplicate username index.
    for (const account of this.accountsById.values()) {
      if (account.username === username) return account
    }
    return undefined
  }
}

function cloneAccount(account: UserAccount): UserAccount {
  return { ...account, createdAt: new Date(account.createdAt) }
}
