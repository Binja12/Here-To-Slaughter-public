import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CommandResult,
  GameAssigned,
  GameCommand,
  GameCommandInput,
  GameSnapshot,
  GameConnectionInfo,
} from '../contract'
import type { GamePort } from '../ports/GamePort'

export type GameApi = {
  info: GameConnectionInfo | null
  connected: boolean
  snapshot: GameSnapshot | null
  send: (command: GameCommandInput) => Promise<CommandResult>
  pendingSince: number | null
}

type NetworkRecord = {
  at: number; event: 'sent' | 'reply' | 'failed' | 'snapshot'
  commandId?: string; commandType?: GameCommand['type']; elapsedMs?: number
  accepted?: boolean; version?: number
}

function recordNetwork(record: NetworkRecord) {
  window.__htsrNetwork = [...(window.__htsrNetwork ?? []), record].slice(-100)
}

declare global {
  interface Window {
    /** The latest snapshot, for the browser console during a playtest. */
    __htsr?: GameSnapshot
    /** Local request/reply timings; never contains card payloads or hidden state. */
    __htsrNetwork?: NetworkRecord[]
  }
}

export function useGameState(port: GamePort, assignment: GameAssigned): GameApi {
  const [info, setInfo] = useState<GameConnectionInfo | null>(null)
  const [connected, setConnected] = useState(false)
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)
  const [pending, setPending] = useState<Record<string, number>>({})

  useEffect(() => {
    setSnapshot(null)
    setInfo(null)
    const accept = (next: GameSnapshot) => {
      recordNetwork({ at: Date.now(), event: 'snapshot', version: next.version })
      setSnapshot((current) => {
        if (current && next.version <= current.version) return current
        window.__htsr = next
        return next
      })
    }
    const disconnect = port.connect(assignment.webSocketUrl, {
      onConnected: setInfo,
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
    async (input: GameCommandInput) => {
      const command = {
        ...input,
        commandId: crypto.randomUUID(),
      } as GameCommand
      const started = Date.now()
      const identity = { commandId: command.commandId, commandType: command.type }
      setPending(current => ({ ...current, [command.commandId]: started }))
      recordNetwork({ ...identity, at: started, event: 'sent' })
      try {
        const result = await port.send(command)
        recordNetwork({ ...identity, at: Date.now(), event: 'reply', elapsedMs: Date.now() - started, accepted: result.accepted })
        return result
      } catch (error) {
        recordNetwork({ ...identity, at: Date.now(), event: 'failed', elapsedMs: Date.now() - started })
        throw error
      } finally {
        setPending(current => {
          const remaining = { ...current }
          delete remaining[command.commandId]
          return remaining
        })
      }
    },
    [port],
  )
  const pendingSince = Object.keys(pending).length ? Math.min(...Object.values(pending)) : null

  return useMemo(
    () => ({ connected, snapshot, send, info, pendingSince }),
    [connected, snapshot, send, info, pendingSince],
  )
}
