import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { firstBoardImages, useImagesReady } from './boardReady'
import { midGame } from '../fixtures/views'

// The board is held until its first images have decoded (the owner, 2026-09-08).
// jsdom fires no load events of its own, so the test drives them.

type FakeImage = { onload: (() => void) | null; onerror: (() => void) | null; src: string; complete: boolean }
const pending: FakeImage[] = []
const originalImage = global.Image

beforeEach(() => {
  jest.useFakeTimers()
  pending.length = 0
  ;(global as unknown as { Image: unknown }).Image = function FakeImageCtor(this: FakeImage) {
    this.onload = null
    this.onerror = null
    this.src = ''
    this.complete = false
    pending.push(this)
  }
})
afterEach(() => {
  jest.useRealTimers()
  ;(global as unknown as { Image: unknown }).Image = originalImage
})

function Probe({ urls }: { urls: string[] }) {
  return <div>{useImagesReady(urls) ? 'ready' : 'waiting'}</div>
}

test('waits for every image, then lets the board through', () => {
  render(<Probe urls={['/a.png', '/b.png']} />)
  expect(screen.getByText('waiting')).toBeInTheDocument()
  expect(pending).toHaveLength(2)

  act(() => { pending[0].onload?.() })
  expect(screen.getByText('waiting')).toBeInTheDocument()
  act(() => { pending[1].onload?.() })
  expect(screen.getByText('ready')).toBeInTheDocument()
})

test('a broken image counts as done — one missing file must not lock the game out', () => {
  render(<Probe urls={['/a.png']} />)
  act(() => { pending[0].onerror?.() })
  expect(screen.getByText('ready')).toBeInTheDocument()
})

test('gives up on its own if an image never arrives', () => {
  render(<Probe urls={['/never.png']} />)
  expect(screen.getByText('waiting')).toBeInTheDocument()
  // long enough for a cold client to fetch a table's art, and no longer
  act(() => { jest.advanceTimersByTime(29_000) })
  expect(screen.getByText('waiting')).toBeInTheDocument()
  act(() => { jest.advanceTimersByTime(1_000) })
  expect(screen.getByText('ready')).toBeInTheDocument()
})

test('nothing to wait for is ready at once', () => {
  render(<Probe urls={[]} />)
  expect(screen.getByText('ready')).toBeInTheDocument()
})

test('the first board is the felt, the frames and every card the view shows', () => {
  const urls = firstBoardImages(midGame)
  expect(urls).toEqual(Array.from(new Set(urls)))
  expect(urls.some((url) => url.includes('Table Background'))).toBe(true)
  expect(urls.some((url) => url.includes('Heroes Frame'))).toBe(true)
  // every card on the table, including the gear a hero carries
  const wornItem = midGame.parties[0].heroes.find((hero) => hero.equippedItem)!.equippedItem!
  expect(urls.some((url) => url.includes(encodeURI(wornItem.name)) || url.includes(wornItem.name))).toBe(true)
})
