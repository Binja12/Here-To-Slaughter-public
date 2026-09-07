import React from 'react'
import { act, render, screen } from '@testing-library/react'
import PendingCommandNotice from './PendingCommandNotice'

test('only slow pending replies show a notice and an acknowledgement clears it', () => {
  jest.useFakeTimers()
  jest.setSystemTime(10000)
  const { rerender, unmount } = render(<PendingCommandNotice since={10000} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  act(() => { jest.advanceTimersByTime(1500) })
  expect(screen.getByRole('status')).toHaveTextContent('Waiting for the server’s reply… 1s')
  rerender(<PendingCommandNotice since={null} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  unmount()
  expect(jest.getTimerCount()).toBe(0)
  jest.useRealTimers()
})
