import type { GameSnapshot } from '../views'
import type { CommandResult, GameCommand } from './game-commands'

export type GameStartedHandler = (snapshot: GameSnapshot) => void
export type GameSnapshotHandler = (snapshot: GameSnapshot) => void
export type GameCompletedHandler = (snapshot: GameSnapshot) => void

export type ServerToClientGameEvents = {
  'game-started': GameStartedHandler
  'game:snapshot': GameSnapshotHandler
  'game-completed': GameCompletedHandler
}

export type ClientToServerGameEvents = {
  'game:command': (
    command: GameCommand,
    acknowledge: (result: CommandResult) => void,
  ) => void
}
