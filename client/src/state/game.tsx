import React, { createContext, useContext } from 'react'
import { PlayerView, GameConnectionInfo } from '../contract'

const GameContext = createContext<PlayerView | null>(null)

const GameInfoContext = createContext<GameConnectionInfo | null>(null)
export const useGameInfo = () => useContext(GameInfoContext)
export const useOptionalGameView = () => useContext(GameContext)

export function GameProvider({
  view,
  info = null,
  children,
}: {
  view: PlayerView
  info?: GameConnectionInfo | null
  children: React.ReactNode
}) {
  return <GameInfoContext.Provider value={info}><GameContext.Provider value={view}>{children}</GameContext.Provider></GameInfoContext.Provider>
}

export function useGameView(): PlayerView {
  const view = useContext(GameContext)
  if (!view) throw new Error('useGameView must be used inside GameProvider')
  return view
}
