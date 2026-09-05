import { Inject, Injectable } from '@nestjs/common'
import type { Pool } from 'pg'
import {
  AccountIdAlreadyExistsError,
  UsernameAlreadyExistsError,
} from '../auth/auth.errors'
import type { IUserRepository } from '../auth/auth.interfaces'
import type { UserAccount } from '../auth/auth.types'
import { PG_POOL } from './database.module'

type UserRow = {
  id: string
  username: string
  password_hash: string
  created_at: Date
}

const UNIQUE_VIOLATION = '23505'

@Injectable()
export class PostgresUserRepository implements IUserRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(account: UserAccount): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO users (id, username, password_hash, created_at)
         VALUES ($1, $2, $3, $4)`,
        [account.id, account.username, account.passwordHash, account.createdAt],
      )
    } catch (error) {
      // The two unique constraints are the same refusals the in-memory
      // repository raises, by name, so AuthService needs no second path.
      const { code, constraint } = error as { code?: string; constraint?: string }
      if (code === UNIQUE_VIOLATION && constraint === 'users_pkey') {
        throw new AccountIdAlreadyExistsError(account.id)
      }
      if (code === UNIQUE_VIOLATION && constraint === 'users_username_key') {
        throw new UsernameAlreadyExistsError(account.username)
      }
      throw error
    }
  }

  async findById(accountId: string): Promise<UserAccount | undefined> {
    const { rows } = await this.pool.query<UserRow>(
      'SELECT id, username, password_hash, created_at FROM users WHERE id = $1',
      [accountId],
    )
    return rows[0] && toAccount(rows[0])
  }

  async findByUsername(username: string): Promise<UserAccount | undefined> {
    const { rows } = await this.pool.query<UserRow>(
      'SELECT id, username, password_hash, created_at FROM users WHERE username = $1',
      [username],
    )
    return rows[0] && toAccount(rows[0])
  }
}

function toAccount(row: UserRow): UserAccount {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  }
}
