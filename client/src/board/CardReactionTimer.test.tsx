import React from 'react'
import { act, render, screen } from '@testing-library/react'
import CardReactionTimer from './CardReactionTimer'
import { GameProvider } from '../state/game'
import { challengeWindowOpen } from '../fixtures/views'

test('uses a red countdown on the art, moves beside zoomed art, and ticks down', () => {
  jest.useFakeTimers()
  const pending = { ...challengeWindowOpen.pendingWindows[0], deadline: Date.now() + 15_000 }
  const view = { ...challengeWindowOpen, pendingWindows: [pending] }
  const timer = (zoomed: boolean) => <GameProvider view={view}><CardReactionTimer cardId={pending.cardId} zoomed={zoomed} /></GameProvider>
  const { rerender } = render(timer(false))
  expect(screen.getByTitle('reaction clock').parentElement).toHaveStyle({ left: '33%' })
  expect(screen.getByTitle('reaction clock').querySelector('circle[stroke="#f87171"]')).toBeTruthy()
  act(() => jest.advanceTimersByTime(6000))
  expect(screen.getByText('9.0')).toBeInTheDocument()
  rerender(timer(true))
  expect(screen.getByTitle('reaction clock').parentElement).toHaveStyle({ left: '103%' })
  jest.useRealTimers()
})
