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
