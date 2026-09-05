import React from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import PlayerHand from './PlayerHand'
import * as audio from '../audio/AudioProvider'

const playSound = jest.fn()

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

beforeEach(() => {
  jest.useFakeTimers()
  playSound.mockClear()
  jest.spyOn(audio, 'useAudio').mockReturnValue({ volume: 50, playSound, setVolume: jest.fn(), setMusic: jest.fn() })
})
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })

test('sweeping the hand rustles once per zoomed card, including returning to a card', () => {
  const { container, getAllByRole } = render(hand(['a.png', 'b.png', 'c.png']))
  const cells = getAllByRole('img').map((image) => image.parentElement!.parentElement!)
  cells.forEach((cell, index) => {
    jest.spyOn(cell, 'getBoundingClientRect').mockReturnValue({
      left: index * 100, right: (index + 1) * 100, top: 0, bottom: 200,
      x: index * 100, y: 0, width: 100, height: 200, toJSON: () => ({}),
    })
  })
  fireEvent.mouseEnter(container.querySelector('.hand-group')!)
  expect(playSound).not.toHaveBeenCalled()
  fireEvent.mouseMove(cells[0], { clientX: 20, clientY: 100 })
  fireEvent.mouseMove(cells[0], { clientX: 40, clientY: 100 })
  expect(playSound).toHaveBeenCalledTimes(1)
  expect(cells[0].firstElementChild).toHaveStyle({ transform: 'scale(1.6)' })
  fireEvent.mouseMove(cells[1], { clientX: 120, clientY: 100 })
  fireEvent.mouseMove(cells[2], { clientX: 220, clientY: 100 })
  expect(playSound).toHaveBeenCalledTimes(3)
  fireEvent.mouseMove(cells[1], { clientX: 120, clientY: 100 })
  expect(playSound).toHaveBeenCalledTimes(4)
  fireEvent.mouseLeave(cells[0].parentElement!)
  fireEvent.mouseMove(cells[1], { clientX: 120, clientY: 100 })
  expect(playSound).toHaveBeenCalledTimes(5)
  expect(playSound.mock.calls.every(([sound]) => sound === 'discardHover')).toBe(true)
})

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
