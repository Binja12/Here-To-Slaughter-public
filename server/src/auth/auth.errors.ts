export class InvalidAuthInputError extends Error {
  constructor() {
    super('Username and password are required')
    this.name = InvalidAuthInputError.name
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid username or password')
    this.name = InvalidCredentialsError.name
  }
}

export class UsernameAlreadyExistsError extends Error {
  constructor(username?: string) {
    super(
      username
        ? `Username already exists: ${username}`
        : 'Username already exists',
    )
    this.name = UsernameAlreadyExistsError.name
  }
}

export class AccountIdAlreadyExistsError extends Error {
  constructor(accountId: string) {
    super(`Account id already exists: ${accountId}`)
    this.name = AccountIdAlreadyExistsError.name
  }
}

export class SessionTokenHashAlreadyExistsError extends Error {
  constructor() {
    super('Session token hash already exists')
    this.name = SessionTokenHashAlreadyExistsError.name
  }
}
