import { MusicTrack } from './MusicTrack'
import { backgroundTraffic } from '../loading/traffic'
import { catalog, musicPlaylist } from '../loading/catalog'

jest.mock('../loading/traffic', () => ({ backgroundTraffic: { busy: false, request: jest.fn() } }))

class FakeAudio {
  static instances: FakeAudio[] = []
  src = ''
  volume = 0
  currentTime = 0
  duration = 300
  paused = true
  ended = false
  preload = ''
  loop = false
  onended: (() => void) | null = null
  ontimeupdate: (() => void) | null = null
  onloadedmetadata: (() => void) | null = null
  onerror: (() => void) | null = null
  play = jest.fn(async () => { this.paused = false })
  pause = jest.fn(() => { this.paused = true })
  load = jest.fn()
  getAttribute = () => this.src
  removeAttribute = () => { this.src = '' }
  constructor() { FakeAudio.instances.push(this) }
}
const originalAudio = window.Audio
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
const parts = [0, 1, 2].map((index) => ({ url: `/part-${index}.mp3`, startSeconds: index * 300, durationSeconds: 300 }))
beforeEach(() => {
  jest.useFakeTimers()
  FakeAudio.instances = []
  window.Audio = FakeAudio as unknown as typeof Audio
  URL.createObjectURL = jest.fn(() => 'blob:next')
  URL.revokeObjectURL = jest.fn()
  ;(backgroundTraffic.request as jest.Mock).mockReset().mockResolvedValue(new Blob(['audio']))
})
afterEach(() => { window.Audio = originalAudio; jest.useRealTimers() })

test('keeps only one next segment, advances in order, loops to the first and releases old buffers', async () => {
  const track = new MusicTrack(parts, '/original.mp3')
  track.volume = 0.14
  expect(FakeAudio.instances[0].src).toBe('')
  await track.play()
  await flush()
  expect(FakeAudio.instances[0].src).toBe('blob:next')
  expect(backgroundTraffic.request).toHaveBeenCalledTimes(1)
  expect(backgroundTraffic.request).toHaveBeenLastCalledWith('/part-0.mp3', 40, expect.any(AbortSignal))
  for (let index = 0; index < 3; index++) {
    const current = FakeAudio.instances[index]
    current.currentTime = 211
    current.ontimeupdate?.()
    await flush()
    expect(backgroundTraffic.request).toHaveBeenLastCalledWith(`/part-${(index + 1) % 3}.mp3`, 5, expect.any(AbortSignal))
    current.currentTime = 299.9
    current.ontimeupdate?.()
    jest.advanceTimersByTime(1)
    await flush()
    jest.advanceTimersByTime(160)
    await flush()
    expect(current.paused).toBe(true)
    expect(current.src).toBe('')
  }
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3)
  track.dispose()
  expect(FakeAudio.instances.every((audio) => audio.paused)).toBe(true)
  expect(jest.getTimerCount()).toBe(0)
})

test('slow background download repeats the current segment; muting aborts the pending transfer', async () => {
  ;(backgroundTraffic.request as jest.Mock).mockResolvedValueOnce(new Blob()).mockImplementation(() => new Promise(() => {}))
  const track = new MusicTrack(parts, '/original.mp3')
  track.volume = 0.14
  await track.play()
  const current = FakeAudio.instances[0]
  current.currentTime = 211
  current.ontimeupdate?.()
  current.currentTime = 300
  current.onended?.()
  expect(current.currentTime).toBe(0)
  expect(backgroundTraffic.request).toHaveBeenCalledTimes(2)
  const signal = (backgroundTraffic.request as jest.Mock).mock.calls[1][2]
  track.setMuted(true)
  expect(signal.aborted).toBe(true)
  expect(current.paused).toBe(true)
  track.dispose()
})

test('missing prepared audio falls back at the corresponding original timeline position', async () => {
  const track = new MusicTrack(parts, '/original.mp3')
  track.volume = 0.14
  await track.play()
  const current = FakeAudio.instances[0]
  current.currentTime = 42
  current.onerror?.()
  const fallback = FakeAudio.instances.at(-1)!
  expect(fallback.src).toBe('/original.mp3')
  expect(fallback.volume).toBe(0.14)
  fallback.onloadedmetadata?.()
  expect(fallback.currentTime).toBe(42)
  fallback.currentTime = 601
  fallback.ontimeupdate?.()
  expect(fallback.currentTime).toBe(0)
  track.dispose()
})


test('trial loops only the first ten minutes and never requests later parts', async () => {
  const source = '/music/Gameplay Music.mp3'
  catalog.music[source] = Array.from({ length: 12 }, (_, index) => ({ url: `/minute-${index}.mp3`, startSeconds: index * 60, durationSeconds: 60 }))
  const track = new MusicTrack(musicPlaylist(source)!, '/original.mp3')
  try {
    track.volume = 0.14
    await track.play()
    for (let index = 0; index < 10; index++) {
      const current = FakeAudio.instances[index]
      current.duration = 60
      current.currentTime = 31
      current.ontimeupdate?.()
      await flush()
      current.onended?.()
      await flush()
      jest.advanceTimersByTime(160)
      await flush()
    }
    expect((backgroundTraffic.request as jest.Mock).mock.calls.map(([url]) => url))
      .toEqual([...Array.from({ length: 10 }, (_, index) => `/minute-${index}.mp3`), '/minute-0.mp3'])
  } finally { track.dispose(); delete catalog.music[source] }
})

test('one-minute segments leave the first half of playback free of next-part traffic', async () => {
  const minuteParts = parts.map((part, index) => ({ ...part, durationSeconds: 60, startSeconds: index * 60 }))
  const track = new MusicTrack(minuteParts, '/original.mp3')
  const current = FakeAudio.instances[0]
  current.duration = 60
  track.volume = 0.14
  await track.play()
  current.currentTime = 29
  current.ontimeupdate?.()
  expect(backgroundTraffic.request).toHaveBeenCalledTimes(1)
  current.currentTime = 31
  current.ontimeupdate?.()
  await flush()
  expect(backgroundTraffic.request).toHaveBeenLastCalledWith('/part-1.mp3', 5, expect.any(AbortSignal))
  track.dispose()
})

test('initial music download is shared across play attempts and cancelled by mute', async () => {
  let complete: (blob: Blob) => void = () => {}
  ;(backgroundTraffic.request as jest.Mock).mockImplementation(() => new Promise(resolve => { complete = resolve }))
  const track = new MusicTrack(parts, '/original.mp3')
  track.volume = 0.14
  const first = track.play()
  const second = track.play()
  expect(backgroundTraffic.request).toHaveBeenCalledTimes(1)
  expect(FakeAudio.instances[0].src).toBe('')
  track.setMuted(true)
  expect((backgroundTraffic.request as jest.Mock).mock.calls[0][2].aborted).toBe(true)
  complete(new Blob())
  await Promise.all([first, second])
  expect(FakeAudio.instances[0].paused).toBe(true)
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  track.dispose()
})
