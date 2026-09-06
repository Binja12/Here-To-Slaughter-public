import React, { useCallback, useEffect, useMemo, useState } from 'react'
import AuthView from './auth/AuthView'
import Board from './board/Board'
import { AudioProvider } from './audio/AudioProvider'
import type { GameAssigned } from './contract'
import LobbyView from './lobby/LobbyView'
import { createGamePort, createLobbyPort } from './ports/createPorts'
import type { GamePort } from './ports/GamePort'
import type { LobbyPort } from './ports/LobbyPort'
import { CommandProvider } from './state/commands'
import { GameProvider } from './state/game'
import { useGameState } from './state/useGameState'
import { useLobbyState } from './state/useLobbyState'

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
  return <LobbyView lobby={lobby} />
}

function GameScreen({
  port,
  assignment,
  onLeave,
}: {
  port: GamePort
  assignment: GameAssigned
  onLeave: () => void
}) {
  const game = useGameState(port, assignment)
  if (!game.snapshot) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 font-heading text-xl text-amber-200">
        {game.connected ? 'Waiting for the table…' : 'Connecting to the table…'}
      </main>
    )
  }

  return (
    <CommandProvider send={game.send}>
      <GameProvider view={game.snapshot.state} info={game.info} log={game.snapshot.log}>
        <AudioProvider><Board onLeave={onLeave} /></AudioProvider>
      </GameProvider>
    </CommandProvider>
  )
}

export default function App() {
  const lobbyPort = useMemo(createLobbyPort, [])
  const gamePort = useMemo(createGamePort, [])
  const [screen, setScreen] = useState<Screen>('checking')
  const [assignment, setAssignment] = useState<GameAssigned | null>(null)

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
    return <GameScreen port={gamePort} assignment={assignment} onLeave={returnToLobby} />
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
