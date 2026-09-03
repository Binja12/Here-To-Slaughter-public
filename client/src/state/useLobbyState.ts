import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameAssigned, LobbySnapshot } from '../contract'
import { LobbyPortError, type LobbyPort } from '../ports/LobbyPort'

export interface LobbyApi {
  snapshot: LobbySnapshot | null
  loading: boolean
  error: string | null
  toggleReady: () => Promise<void>
  startGame: () => Promise<void>
  logout: () => Promise<void>
}

export function useLobbyState(
  port: LobbyPort,
  onGameAssigned: (assignment: GameAssigned) => void,
  onLogout: () => void,
): LobbyApi {
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Counts SSE snapshots. A request's own response is applied only when no
  // push arrived while it was in flight: the server pushes `lobby-updated`
  // to everyone BEFORE it answers the request, and the other seats react
  // to that push, so by the time the answer lands it can already be stale
  // (seen live: two bots readied inside the Ready round-trip and the answer
  // overwrote them, leaving Start disabled on a table of three).
  const pushes = useRef(0)

  const capture = useCallback((cause: unknown) => {
    setError(cause instanceof LobbyPortError ? cause.reason : 'InternalError')
  }, [])

  const applyUnlessPushed = useCallback(
    async (request: () => Promise<LobbySnapshot>) => {
      const seen = pushes.current
      const next = await request()
      if (pushes.current === seen) setSnapshot(next)
    },
    [],
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    void applyUnlessPushed(() => port.getLobby())
      .catch((cause: unknown) => {
        if (active) capture(cause)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const unsubscribe = port.subscribe({
      onLobbyUpdated: (next) => {
        pushes.current += 1
        setSnapshot(next)
        setError(null)
      },
      onGameAssigned,
      onFailure: setError,
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [applyUnlessPushed, capture, onGameAssigned, port])

  const toggleReady = useCallback(async () => {
    if (!snapshot) return
    setError(null)
    try {
      await applyUnlessPushed(() =>
        snapshot.self.state === 'READY' ? port.unready() : port.ready(),
      )
    } catch (cause) {
      capture(cause)
    }
  }, [applyUnlessPushed, capture, port, snapshot])

  const startGame = useCallback(async () => {
    setError(null)
    try {
      await port.startGame()
    } catch (cause) {
      capture(cause)
    }
  }, [capture, port])

  const logout = useCallback(async () => {
    try {
      await port.logout()
    } finally {
      onLogout()
    }
  }, [onLogout, port])

  return useMemo(
    () => ({ snapshot, loading, error, toggleReady, startGame, logout }),
    [error, loading, logout, snapshot, startGame, toggleReady],
  )
}
