import React, { createContext, useContext } from 'react'
import { PlayerView, GameConnectionInfo, GameLogEntry } from '../contract'

const GameContext = createContext<PlayerView | null>(null)

const GameInfoContext = createContext<GameConnectionInfo | null>(null)
export const useGameInfo = () => useContext(GameInfoContext)

const NO_LOG: GameLogEntry[] = []
const GameLogContext = createContext<GameLogEntry[]>(NO_LOG)
export const useGameLog = () => useContext(GameLogContext)
export const useOptionalGameView = () => useContext(GameContext)

export function GameProvider({
  view,
  info = null,
  log = NO_LOG,
  children,
}: {
  view: PlayerView
  info?: GameConnectionInfo | null
  log?: GameLogEntry[]
  children: React.ReactNode
}) {
  return (
    <GameInfoContext.Provider value={info}>
      <GameLogContext.Provider value={log}>
        <GameContext.Provider value={view}>{children}</GameContext.Provider>
      </GameLogContext.Provider>
    </GameInfoContext.Provider>
  )
}

export function useGameView(): PlayerView {
  const view = useContext(GameContext)
  if (!view) throw new Error('useGameView must be used inside GameProvider')
  return view
}
