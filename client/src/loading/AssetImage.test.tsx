import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import AssetImage from './AssetImage'
import { catalog, selectImage } from './catalog'

const originalWidth = window.innerWidth
const originalHeight = window.innerHeight
const originalDpr = window.devicePixelRatio
afterEach(() => {
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: originalWidth },
    innerHeight: { configurable: true, value: originalHeight },
    devicePixelRatio: { configurable: true, value: originalDpr },
  })
  delete catalog.images['/test-card.png']
})

test('keeps the 480 trial profile on hover and DPR change, retaining larger profiles and original fallback', () => {
  const entry = { full: '/full.webp', variants: [[480, '/480.webp'], [1080, '/1080.webp'], [1440, '/1440.webp'], [2160, '/2160.webp']] as [number, string][] }
  catalog.images['/test-card.png'] = entry
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: 1920 }, innerHeight: { configurable: true, value: 1080 },
    devicePixelRatio: { configurable: true, value: 1 },
  })
  render(<AssetImage src="/test-card.png" alt="Card" />)
  const card = screen.getByAltText('Card')
  expect(card).toHaveAttribute('src', '/480.webp')
  fireEvent.mouseEnter(card)
  expect(card).toHaveAttribute('src', '/480.webp')
  act(() => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
    window.dispatchEvent(new Event('resize'))
  })
  expect(card).toHaveAttribute('src', '/480.webp')
  fireEvent.error(card)
  expect(card).toHaveAttribute('src', '/full.webp')
  fireEvent.error(card)
  expect(card).toHaveAttribute('src', '/test-card.png')
  expect(selectImage(entry, 3000)).toBe('/full.webp')
  expect(selectImage(entry, 2160)).toBe('/2160.webp')
})
