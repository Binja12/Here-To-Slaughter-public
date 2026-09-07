import React from 'react'
import { render, screen } from '@testing-library/react'
import GameScreen from './GameScreen'
import { useGameState } from './state/useGameState'

jest.mock('./state/useGameState', () => ({ useGameState: jest.fn() }))
jest.mock('./board/Board', () => () => <div>Game board</div>)
jest.mock('./audio/AudioProvider', () => ({ AudioProvider: ({ children }: { children: React.ReactNode }) => children }))

test('a lost connection keeps the board visible and tells the player why actions stopped, then clears on reconnect', () => {
  const game = { connected: true, snapshot: { state: {} }, info: null, send: jest.fn() }
  ;(useGameState as jest.Mock).mockImplementation(() => game)
  const assignment = { gameId: 'test', webSocketUrl: '/' }
  const onLeave = jest.fn()
  const { rerender } = render(<GameScreen assignment={assignment} onLeave={onLeave} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  game.connected = false
  rerender(<GameScreen assignment={assignment} onLeave={onLeave} />)
  expect(screen.getByRole('status')).toHaveTextContent('Connection to the game was lost')
  expect(screen.getByText('Game board')).toBeInTheDocument()
  game.connected = true
  rerender(<GameScreen assignment={assignment} onLeave={onLeave} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
