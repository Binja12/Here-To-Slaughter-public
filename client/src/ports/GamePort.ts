import {
  CommandResult,
  GameCommand,
  GameSnapshot,
} from '../contract'

export type GameEvents = {
  onStarted: (snapshot: GameSnapshot) => void
  onSnapshot: (snapshot: GameSnapshot) => void
  onCompleted: (snapshot: GameSnapshot) => void
  onConnectionChange?: (connected: boolean) => void
}

export interface GamePort {
  connect(webSocketUrl: string, events: GameEvents): () => void
  send(command: GameCommand): Promise<CommandResult>
}
