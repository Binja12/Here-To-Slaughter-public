import React, { createContext, useContext } from 'react'
import { PlayerView } from '../contract'

const GameContext = createContext<PlayerView | null>(null)

export function GameProvider({
  view,
  children,
}: {
  view: PlayerView
  children: React.ReactNode
}) {
  return <GameContext.Provider value={view}>{children}</GameContext.Provider>
}

export function useGameView(): PlayerView {
  const view = useContext(GameContext)
  if (!view) throw new Error('useGameView must be used inside GameProvider')
  return view
}
