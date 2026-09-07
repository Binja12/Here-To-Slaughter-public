import { artFor, boardMagicUrl } from './assets'
import { CardView } from '../contract'

const magic = (name: string): CardView =>
  ({ id: 'm', name, type: 'Magic', image: '', description: '' }) as unknown as CardView

test('a magic with a scan draws it', () => {
  expect(artFor(magic('Winds of Change')).url).toBe(boardMagicUrl('Winds Of Change'))
})

test('a magic whose scan is filed under another name still draws it', () => {
  // the scan says "Call Of The Fallen", the card says "Call to the Fallen"
  expect(artFor(magic('Call to the Fallen')).url).toBe(boardMagicUrl('Call Of The Fallen'))
})

test('a magic without a scan draws a placeholder that names the card instead of a broken image', () => {
  const { url } = artFor(magic('Sorcerous Placeholder'))
  expect(url.startsWith('data:image/svg+xml')).toBe(true)
  expect(decodeURIComponent(url)).toContain('Sorcerous')
  expect(decodeURIComponent(url)).toContain('MAGIC')
})
