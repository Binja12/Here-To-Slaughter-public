import { io, Socket } from 'socket.io-client'
import {
  ClientToServerGameEvents,
  CommandResult,
  GameCommand,
  GameSnapshot,
  ServerToClientGameEvents,
} from '../contract'
import { GameEvents, GamePort } from './GamePort'

export class RealGamePort implements GamePort {
  private socket: Socket<ServerToClientGameEvents, ClientToServerGameEvents> | null = null

  connect(webSocketUrl: string, events: GameEvents): () => void {
    this.socket?.disconnect()
    const socket = io(webSocketUrl, {
      transports: ['websocket'],
      withCredentials: true,
    })
    this.socket = socket

    socket.on('connect', () => events.onConnectionChange?.(true))
    socket.on('disconnect', () => events.onConnectionChange?.(false))
    socket.on('game:connected', (info) => events.onConnected?.(info))
    socket.on('game-started', (snapshot: GameSnapshot) => events.onStarted(snapshot))
    socket.on('game:snapshot', (snapshot: GameSnapshot) => events.onSnapshot(snapshot))
    socket.on('game-completed', (snapshot: GameSnapshot) => events.onCompleted(snapshot))

    return () => {
      if (this.socket === socket) this.socket = null
      socket.disconnect()
    }
  }

  async send(command: GameCommand): Promise<CommandResult> {
    const first = await this.emitOnce(command)
    if (first) return first
    const retry = await this.emitOnce(command)
    return retry ?? {
      commandId: command.commandId,
      accepted: false,
      error: 'InternalError',
    }
  }

  private emitOnce(command: GameCommand): Promise<CommandResult | null> {
    const socket = this.socket
    if (!socket?.connected) return Promise.resolve(null)
    return new Promise((resolve) => {
      let settled = false
      const timer = window.setTimeout(() => {
        if (!settled) resolve(null)
        settled = true
      }, 5000)
      socket.emit('game:command', command, (result: CommandResult) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve(result)
      })
    })
  }
}
