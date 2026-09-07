import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import AssetImage from './AssetImage'
import { catalog, selectImage } from './catalog'

afterEach(() => {
  delete catalog.images['/test-card.png']
})

test('takes the one prepared export, whatever the viewport, and falls back on failure', () => {
  // One profile now: the 720p-stage export, or the master's own size for a
  // background (scripts/online-art-sizes.mjs). Nothing re-picks on resize.
  const entry = { full: '/720.webp', variants: [[720, '/720.webp']] as [number, string][] }
  catalog.images['/test-card.png'] = entry
  render(<AssetImage src="/test-card.png" alt="Card" />)
  const card = screen.getByAltText('Card')
  expect(card).toHaveAttribute('src', '/720.webp')

  act(() => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
    window.dispatchEvent(new Event('resize'))
  })
  expect(card).toHaveAttribute('src', '/720.webp')

  // a missing export drops to the PNG master rather than a broken image
  fireEvent.error(card)
  expect(card).toHaveAttribute('src', '/test-card.png')
  expect(selectImage(entry)).toBe('/720.webp')
})
