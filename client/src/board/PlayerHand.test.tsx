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

/** the FanCard wrapper of each card, left to right */
const fanCards = (getAllByRole: (role: string) => HTMLElement[]) =>
  getAllByRole('img').map((image) => image.parentElement!)

const withIds = (cards: string[], ids: string[]) => (
  <PlayerHand cards={cards} ids={ids} anchorCenterCqw={82}>
    <div>stack</div>
  </PlayerHand>
)
const arrivals = (getAllByRole: (role: string) => HTMLElement[]) =>
  fanCards(getAllByRole).map((card) => card.className.includes('hand-arrival'))
/**
 * The card's own animation finishing — what retires it, in place of a timer.
 * jsdom ships no `AnimationEvent` constructor, so `fireEvent.animationEnd`'s
 * init dict is dropped and `animationName` never reaches the handler; the
 * property has to be hung on the event by hand.
 */
const namedAnimationEnd = (card: HTMLElement, animationName: string) => {
  const event = new Event('animationend', { bubbles: true })
  Object.defineProperty(event, 'animationName', { value: animationName })
  fireEvent(card, event)
}
const finishPop = (card: HTMLElement) => namedAnimationEnd(card, 'hand-arrival')

test('a card joining the hand zooms — that card, not the ones already held', () => {
  const { getAllByRole, rerender } = render(withIds(['a.png', 'b.png'], ['a', 'b']))
  // the opening hand is not an arrival
  expect(arrivals(getAllByRole)).toEqual([false, false])

  // a THIRD card, drawn with the same art as one already held: the id is what
  // says which one is new
  rerender(withIds(['a.png', 'b.png', 'a.png'], ['a', 'b', 'c']))
  expect(arrivals(getAllByRole)).toEqual([false, false, true])

  // the card retires ITSELF when its own animation ends — another element's
  // animation bubbling through must not count
  namedAnimationEnd(fanCards(getAllByRole)[2], 'aura-clock')
  expect(arrivals(getAllByRole)).toEqual([false, false, true])
  finishPop(fanCards(getAllByRole)[2])
  expect(arrivals(getAllByRole)).toEqual([false, false, false])
})

test('a second card arriving does not cut the first one short', () => {
  const { getAllByRole, rerender } = render(withIds(['a.png'], ['a']))
  rerender(withIds(['a.png', 'b.png'], ['a', 'b']))
  expect(arrivals(getAllByRole)).toEqual([false, true])

  // c lands while b is still popping: b keeps its own animation
  rerender(withIds(['a.png', 'b.png', 'c.png'], ['a', 'b', 'c']))
  expect(arrivals(getAllByRole)).toEqual([false, true, true])

  // and each one ends on its own
  finishPop(fanCards(getAllByRole)[1])
  expect(arrivals(getAllByRole)).toEqual([false, false, true])
  finishPop(fanCards(getAllByRole)[2])
  expect(arrivals(getAllByRole)).toEqual([false, false, false])
})

test('two cards drawn together both pop, one after the other (Peanut)', () => {
  const { getAllByRole, rerender } = render(withIds(['a.png'], ['a']))
  rerender(withIds(['a.png', 'b.png', 'c.png'], ['a', 'b', 'c']))

  expect(arrivals(getAllByRole)).toEqual([false, true, true])
  const [, first, second] = fanCards(getAllByRole)
  expect(first.style.animationDelay).toBe('')
  expect(second.style.animationDelay).toBe('160ms')

  // the first one finishing does not re-time the second
  finishPop(first)
  expect(fanCards(getAllByRole)[2].style.animationDelay).toBe('160ms')
})

test('playing a card does not replay an arrival on the cards that shift left', () => {
  const { getAllByRole, rerender } = render(withIds(['a.png', 'b.png'], ['a', 'b']))
  rerender(withIds(['a.png', 'b.png', 'c.png'], ['a', 'b', 'c']))
  finishPop(fanCards(getAllByRole)[2])
  expect(arrivals(getAllByRole)).toEqual([false, false, false])

  // 'a' is played: every later card's INDEX changes, but its identity does not
  rerender(withIds(['b.png', 'c.png'], ['b', 'c']))
  expect(arrivals(getAllByRole)).toEqual([false, false])
})

test('click-to-open: the fan ignores hover and opens when the board says it is held', () => {
  const stickyHand = (stuckOpen: boolean, onStickyOpen = jest.fn()) => (
    <PlayerHand cards={['a.png']} anchorCenterCqw={82} sticky stuckOpen={stuckOpen} onStickyOpen={onStickyOpen}>
      <div>stack</div>
    </PlayerHand>
  )
  const opened = jest.fn()
  const { container, rerender } = render(stickyHand(false, opened))

  // the stack says it is pressable
  expect(container.querySelector('.hand-group')!.className).toContain('cursor-pointer')

  // hover is no longer what opens it: not even the hover-gated classes are on
  expect(fanIsOpen(container)).toBe(false)
  expect(container.querySelector('.hand-group > div:nth-child(2)')!.className)
    .not.toContain('group-hover:opacity-100')

  fireEvent.click(container.querySelector('.hand-group')!)
  expect(opened).toHaveBeenCalled()

  rerender(stickyHand(true, opened))
  expect(fanIsOpen(container)).toBe(true)
  // …and stops saying so once it is open
  expect(container.querySelector('.hand-group')!.className).not.toContain('cursor-pointer')
})

test('the hand stack only offers a pointer while the togglable setting is on', () => {
  const { container } = render(
    <PlayerHand cards={['a.png']} anchorCenterCqw={82}>
      <div>stack</div>
    </PlayerHand>,
  )
  expect(container.querySelector('.hand-group')!.className).not.toContain('cursor-pointer')
})

test('click-to-open: a card arriving holds the fan open rather than peeking', () => {
  const opened = jest.fn()
  const stickyHand = (cards: string[]) => (
    <PlayerHand cards={cards} anchorCenterCqw={82} sticky stuckOpen={false} onStickyOpen={opened}>
      <div>stack</div>
    </PlayerHand>
  )
  const { container, rerender } = render(stickyHand(['a.png']))
  rerender(stickyHand(['a.png', 'b.png']))

  expect(opened).toHaveBeenCalled()
  // and it never opens itself on a timer the felt press cannot beat
  expect(fanIsOpen(container)).toBe(false)
})
