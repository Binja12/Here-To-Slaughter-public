import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CommandResult,
  GameAssigned,
  GameCommand,
  GameCommandInput,
  GameSnapshot,
} from '../contract'
import type { GamePort } from '../ports/GamePort'

export type GameApi = {
  connected: boolean
  snapshot: GameSnapshot | null
  send: (command: GameCommandInput) => Promise<CommandResult>
}

declare global {
  interface Window {
    /** The latest snapshot, for the browser console during a playtest. */
    __htsr?: GameSnapshot
  }
}

export function useGameState(port: GamePort, assignment: GameAssigned): GameApi {
  const [connected, setConnected] = useState(false)
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)

  useEffect(() => {
    setSnapshot(null)
    const accept = (next: GameSnapshot) =>
      setSnapshot((current) => {
        if (current && next.version <= current.version) return current
        window.__htsr = next
        return next
      })
    const disconnect = port.connect(assignment.webSocketUrl, {
      onStarted: accept,
      onSnapshot: accept,
      onCompleted: accept,
      onConnectionChange: setConnected,
    })

    return () => {
      disconnect()
      setConnected(false)
    }
  }, [assignment, port])

  const send = useCallback(
    (input: GameCommandInput) => {
      const command = {
        ...input,
        commandId: crypto.randomUUID(),
      } as GameCommand
      return port.send(command)
    },
    [port],
  )

  return useMemo(
    () => ({ connected, snapshot, send }),
    [connected, snapshot, send],
  )
}
