import { artFor, boardMagicUrl } from './assets'
import { CardView } from '../contract'

const magic = (name: string): CardView =>
  ({ id: 'm', name, type: 'Magic', image: '', description: '' }) as unknown as CardView

test('a magic with a scan draws it', () => {
  expect(artFor(magic('Winds of Change')).url).toBe(boardMagicUrl('Winds Of Change'))
})

test('a magic without a scan draws a placeholder that names the card instead of a broken image', () => {
  const { url } = artFor(magic('Call to the Fallen'))
  expect(url.startsWith('data:image/svg+xml')).toBe(true)
  expect(decodeURIComponent(url)).toContain('Call to the')
  expect(decodeURIComponent(url)).toContain('MAGIC')
})
