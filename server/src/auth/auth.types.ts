export type UserAccount = {
  id: string
  username: string
  passwordHash: string
  createdAt: Date
}

export type Session = {
  tokenHash: string
  accountId: string
  createdAt: Date
  expiresAt: Date
}

export type AuthenticatedAccount = {
  accountId: string
  username: string
}

export type AuthSession = AuthenticatedAccount & {
  token: string
  expiresAt: Date
}
