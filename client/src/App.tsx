import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import AuthView from './auth/AuthView'
import type { GameAssigned } from './contract'
import { createLobbyPort } from './ports/createPorts'
import type { LobbyPort } from './ports/LobbyPort'
import { useLobbyState } from './state/useLobbyState'
import { loadGameScreen, loadLobbyView, useAssetWarmup } from './loading/warmup'

const LobbyView = lazy(loadLobbyView)
const GameScreen = lazy(loadGameScreen)
const opening = <main className="flex min-h-screen items-center justify-center bg-zinc-950 font-heading text-xl text-amber-200">Opening Here to Slaughter…</main>

type Screen = 'checking' | 'auth' | 'lobby' | 'game'

/** Dev: `?autostart=1` against the fakes logs in, readies and starts at once. */
const AUTOSTART =
  process.env.REACT_APP_FAKE_SERVER === '1' &&
  new URLSearchParams(window.location.search).has('autostart')
let autoStartUsed = false

function LobbyScreen({
  port,
  onAssigned,
  onLogout,
  autoStart = false,
}: {
  port: LobbyPort
  onAssigned: (assignment: GameAssigned) => void
  onLogout: () => void
  autoStart?: boolean
}) {
  const lobby = useLobbyState(port, onAssigned, onLogout)
  useEffect(() => {
    // once per page load: after Exit the lobby must stay a lobby
    if (!autoStart || autoStartUsed || !lobby.snapshot) return
    if (lobby.snapshot.self.state !== 'READY') {
      void lobby.toggleReady()
      return
    }
    if (lobby.snapshot.self.isHost && lobby.snapshot.readyPlayers.length >= 2) {
      autoStartUsed = true
      void lobby.startGame()
    }
  }, [autoStart, lobby])
  return <Suspense fallback={opening}><LobbyView lobby={lobby} /></Suspense>
}

export default function App() {
  const lobbyPort = useMemo(createLobbyPort, [])
  const [screen, setScreen] = useState<Screen>('checking')
  const [assignment, setAssignment] = useState<GameAssigned | null>(null)
  useAssetWarmup(screen === 'game' ? 'game-connecting' : screen)

  useEffect(() => {
    let active = true
    const open = AUTOSTART
      ? lobbyPort.login({ username: 'Player One', password: 'test' })
      : lobbyPort.getLobby()
    open
      .then(() => {
        if (active) setScreen('lobby')
      })
      .catch(() => {
        if (active) setScreen('auth')
      })
    return () => {
      active = false
    }
  }, [lobbyPort])

  const enterGame = useCallback((next: GameAssigned) => {
    performance.mark?.('htsr:join-game')
    setAssignment(next)
    setScreen('game')
  }, [])

  const returnToLobby = useCallback(() => {
    setAssignment(null)
    setScreen('lobby')
  }, [])

  if (screen === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 font-heading text-xl text-amber-200">
        Opening Here to Slaughter…
      </main>
    )
  }

  if (screen === 'auth') {
    return <AuthView port={lobbyPort} onAuthenticated={() => setScreen('lobby')} />
  }

  if (screen === 'game' && assignment) {
    return <Suspense fallback={opening}><GameScreen assignment={assignment} onLeave={returnToLobby} /></Suspense>
  }

  return (
    <LobbyScreen
      port={lobbyPort}
      onAssigned={enterGame}
      onLogout={() => setScreen('auth')}
      autoStart={AUTOSTART}
    />
  )
}
