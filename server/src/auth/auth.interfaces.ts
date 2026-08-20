import { Session, UserAccount } from './auth.types'

export const USER_REPOSITORY = Symbol('IUserRepository')
export const SESSION_STORE = Symbol('ISessionStore')

export interface IUserRepository {
  create(account: UserAccount): Promise<void>
  findById(accountId: string): Promise<UserAccount | undefined>
  findByUsername(username: string): Promise<UserAccount | undefined>
}

export interface ISessionStore {
  create(session: Session): Promise<void>
  findByTokenHash(tokenHash: string): Promise<Session | undefined>
  revoke(tokenHash: string): Promise<boolean>
  revokeAllForAccount(accountId: string): Promise<number>
}
