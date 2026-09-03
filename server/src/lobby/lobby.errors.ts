export class LobbyFullError extends Error {
  constructor(capacity: number) {
    super(`Lobby is full (maximum ${capacity} players)`)
    this.name = LobbyFullError.name
  }
}

export class AccountAlreadyInGameError extends Error {
  constructor() {
    super('Account is already assigned to a game')
    this.name = AccountAlreadyInGameError.name
  }
}

export class OnlyHostCanStartError extends Error {
  constructor() {
    super('Only the host can start a game')
    this.name = OnlyHostCanStartError.name
  }
}

export class InvalidReadyPlayerCountError extends Error {
  constructor(minimum: number, maximum: number) {
    super(`A game requires ${minimum} to ${maximum} ready players`)
    this.name = InvalidReadyPlayerCountError.name
  }
}

export class GameServerUnavailableError extends Error {
  constructor() {
    super('Game server is unavailable')
    this.name = GameServerUnavailableError.name
  }
}

export class InvalidGameCompletedEventError extends Error {
  constructor() {
    super('Invalid game-completed event')
    this.name = 'InvalidGameCompletedEventError'
  }
}

export class GameStartInProgressError extends Error {
  constructor() {
    super('A game is already being started')
    this.name = GameStartInProgressError.name
  }
}
