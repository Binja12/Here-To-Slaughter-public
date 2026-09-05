import React from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import PlayerHand from './PlayerHand'

const hand = (cards: string[]) => (
  <PlayerHand cards={cards} anchorCenterCqw={82}>
    <div>stack</div>
  </PlayerHand>
)

/** The fan wrapper: open when it carries the plain (not hover-gated) opacity-100. */
const fanIsOpen = (container: HTMLElement) => {
  const fan = container.querySelector('.hand-group > div:nth-child(2)')!
  return fan.className.split(' ').includes('opacity-100')
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

test('a card arriving opens the fan by itself for three seconds', () => {
  const { container, rerender } = render(hand(['a.png', 'b.png']))
  expect(fanIsOpen(container)).toBe(false)

  rerender(hand(['a.png', 'b.png', 'c.png']))
  expect(fanIsOpen(container)).toBe(true)

  act(() => {
    jest.advanceTimersByTime(2_900)
  })
  expect(fanIsOpen(container)).toBe(true)
  act(() => {
    jest.advanceTimersByTime(200)
  })
  expect(fanIsOpen(container)).toBe(false)
})

test('the cursor arriving on the hand ends the peek and hands the fan back to hover', () => {
  const { container, rerender } = render(hand(['a.png']))
  rerender(hand(['a.png', 'b.png']))
  expect(fanIsOpen(container)).toBe(true)

  fireEvent.mouseEnter(container.querySelector('.hand-group')!)
  // hover-gated from here on: the plain open class is gone
  expect(fanIsOpen(container)).toBe(false)
})

test('a card leaving does not open the fan', () => {
  const { container, rerender } = render(hand(['a.png', 'b.png']))
  rerender(hand(['a.png']))
  expect(fanIsOpen(container)).toBe(false)
})
