import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { AudioProvider, useAudio } from './AudioProvider'
import { backgroundTraffic } from '../loading/traffic'
import VolumeControl from './VolumeControl'
import { useGameAudio } from './useGameAudio'
import { GameLogEntry, PlayerView } from '../contract'
import { challengeStarted, midGame, modifierWindowOpen } from '../fixtures/views'

jest.mock('../loading/traffic', () => ({ backgroundTraffic: { busy: false, onIdle: () => () => {}, foregroundRequest: () => () => {}, request: jest.fn(async () => new Blob()) } }))

class FakeAudio {
  static instances: FakeAudio[] = []
  volume = 1
  currentTime = 0
  playbackRate = 1
  preservesPitch = true
  paused = true
  loop = false
  preload = ''
  onended?: () => void
  onerror?: () => void
  play = jest.fn(() => { this.paused = false; return Promise.resolve() })
  pause = jest.fn(() => { this.paused = true })
  removeAttribute = jest.fn()
  load = jest.fn()
  getAttribute = (name: string) => name === 'src' ? this.src : null
  constructor(public src = '') { FakeAudio.instances.push(this) }
}
const originalAudio = window.Audio
beforeEach(() => {
  localStorage.clear()
  ;(backgroundTraffic.request as jest.Mock).mockResolvedValue(new Blob())
  URL.createObjectURL = jest.fn(() => 'blob:music')
  URL.revokeObjectURL = jest.fn()
  FakeAudio.instances = []
  window.Audio = FakeAudio as unknown as typeof Audio
})
afterEach(() => { window.Audio = originalAudio; jest.useRealTimers(); jest.restoreAllMocks() })

function GameAudio({ view = midGame, log = [] }: { view?: PlayerView; log?: GameLogEntry[] }) {
  useGameAudio(view, log)
  const { playSound } = useAudio()
  return <><VolumeControl /><button onClick={() => playSound('skipReaction')}>Skip</button></>
}
const entry = (seq: number, sound: GameLogEntry['sound'] = 'heroPlayed'): GameLogEntry =>
  ({ seq, sound, at: Date.now(), playerId: 'opponent', text: 'An action' })
const oneShots = () => FakeAudio.instances.filter((audio) => audio.src.includes('sound effects'))

const modifier = (seq: number, soundWindowId = 'roll-a'): GameLogEntry =>
  ({ ...entry(seq, 'modifierPlayed'), soundWindowId })

test('modifiers climb two semitones each, cap at ten, and reset for another window', () => {
  const ui = (log: GameLogEntry[]) => <AudioProvider><GameAudio log={log} /></AudioProvider>
  const { rerender } = render(ui([]))
  const log = Array.from({ length: 12 }, (_, index) => modifier(index + 1))
  rerender(ui(log))
  const sounds = oneShots()
  expect(sounds).toHaveLength(12)
  sounds.forEach((sound, index) => {
    expect(sound.preservesPitch).toBe(false)
    expect(sound.playbackRate).toBeCloseTo(2 ** (Math.min(index, 9) / 6))
  })
  rerender(ui([...log]))
  expect(oneShots()).toHaveLength(12)
  rerender(ui([...log, modifier(13, 'roll-b')]))
  expect(oneShots()[12].playbackRate).toBe(1)
})

test('history and muted plays count; interleaved windows and other effects stay independent', () => {
  let log = [modifier(1), modifier(2)]
  const ui = () => <AudioProvider><GameAudio log={log} /></AudioProvider>
  const { rerender } = render(ui())
  expect(oneShots()).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Mute sound' }))
  log = [...log, modifier(3)]
  rerender(ui())
  expect(oneShots()).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Unmute sound' }))
  log = [...log, modifier(4, 'challenge-b'), entry(5), modifier(6)]
  rerender(ui())
  expect(oneShots().map((sound) => sound.playbackRate)).toEqual([1, 1, 2 ** (3 / 6)])
  expect(oneShots()[1].preservesPitch).toBe(true)
  // Both players' modifiers into the same challenge share its counter.
  log = [...log, { ...modifier(7, 'challenge-b'), playerId: 'another-player' }]
  rerender(ui())
  expect(oneShots()[3].playbackRate).toBeCloseTo(2 ** (1 / 6))
})

test('volume updates ongoing music and effects, mutes, restores, and persists', () => {
  render(<AudioProvider><GameAudio /></AudioProvider>)
  fireEvent.click(screen.getByText('Skip'))
  fireEvent.change(screen.getByRole('slider'), { target: { value: '80' } })
  expect(FakeAudio.instances[0].volume).toBeCloseTo(0.224)
  expect(oneShots()[0].volume).toBe(0.8)
  expect(localStorage.getItem('htsr.volume')).toBe('80')
  fireEvent.click(screen.getByRole('button', { name: 'Mute sound' }))
  expect(FakeAudio.instances.every((audio) => audio.volume === 0)).toBe(true)
  fireEvent.click(screen.getByText('Skip'))
  expect(oneShots()).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Unmute sound' }))
  expect(screen.getByRole('slider')).toHaveValue('80')
})

test('history is silent, confirmed actions play once, new games reset the cursor', () => {
  const ui = (log: GameLogEntry[], view = midGame) => <AudioProvider><GameAudio log={log} view={view} /></AudioProvider>
  const { rerender } = render(ui([entry(1)]))
  expect(oneShots()).toHaveLength(0)
  rerender(ui([entry(1), entry(2), entry(3, 'modifierPlayed'), entry(4, 'monsterSlain')]))
  expect(oneShots().map((audio) => audio.src)).toEqual([
    '/sound effects/hero played.mp3', '/sound effects/modifier sound.mp3', '/sound effects/monster slain.mp3',
  ])
  rerender(ui([entry(1), entry(2), entry(3), entry(4)]))
  rerender(ui([entry(1)], { ...midGame, gameId: 'another-game' }))
  expect(oneShots()).toHaveLength(3)
})

test('music crossfades in both directions and pauses the outgoing track only after the fade', async () => {
  jest.useFakeTimers()
  const ui = (view: PlayerView) => <AudioProvider><GameAudio view={view} /></AudioProvider>
  const { rerender, unmount } = render(ui(midGame))
  await act(async () => {})
  const [gameplay, challenge] = FakeAudio.instances
  expect(gameplay.paused).toBe(false)
  expect(gameplay.loop).toBe(true)
  expect(challenge.volume).toBe(0)
  await act(async () => { rerender(ui(challengeStarted)) })
  expect(gameplay.paused).toBe(false)
  expect(challenge.paused).toBe(false)
  expect(challenge.volume).toBe(0)
  act(() => { jest.advanceTimersByTime(512) })
  expect(gameplay.volume).toBeGreaterThan(0)
  expect(gameplay.volume).toBeLessThan(0.14)
  expect(challenge.volume).toBeGreaterThan(0)
  expect(challenge.volume).toBeLessThan(0.14)
  expect(gameplay.volume + challenge.volume).toBeCloseTo(0.14)
  act(() => { jest.advanceTimersByTime(512) })
  expect(gameplay.paused).toBe(true)
  expect(gameplay.volume).toBe(0)
  expect(challenge.volume).toBeCloseTo(0.14)
  await act(async () => { rerender(ui(midGame)) })
  expect(challenge.paused).toBe(false)
  expect(gameplay.paused).toBe(false)
  act(() => { jest.advanceTimersByTime(1024) })
  expect(challenge.paused).toBe(true)
  expect(gameplay.volume).toBeCloseTo(0.14)
  unmount()
  expect(FakeAudio.instances.every((audio) => audio.paused)).toBe(true)
  expect(jest.getTimerCount()).toBe(0)
})

test('challenge music starts once per window while gameplay keeps its paused position', async () => {
  jest.useFakeTimers()
  const idle = { ...midGame, pendingWindows: [] }
  const rolling = { ...midGame, pendingWindows: modifierWindowOpen.pendingWindows }
  const windowId = rolling.pendingWindows[0].windowId
  const ui = (view: PlayerView, log: GameLogEntry[] = []) => <AudioProvider><GameAudio view={view} log={log} /></AudioProvider>
  const { rerender } = render(ui(idle))
  const [gameplay, challenge] = FakeAudio.instances
  gameplay.currentTime = 42
  challenge.currentTime = 17
  await act(async () => { rerender(ui(rolling)) })
  expect(challenge.paused).toBe(true)
  const firstPlay = [modifier(1, windowId)]
  await act(async () => { rerender(ui(rolling, firstPlay)) })
  expect(challenge.currentTime).toBe(0)
  act(() => { jest.advanceTimersByTime(1024) })
  expect(gameplay.paused).toBe(true)
  expect(gameplay.currentTime).toBe(42)
  expect(challenge.paused).toBe(false)

  challenge.currentTime = 8
  await act(async () => { rerender(ui({ ...rolling }, [...firstPlay])) })
  expect(challenge.currentTime).toBe(8)
  // A SECOND card into the same window does not start the track again: one
  // start per window, not one per answer (the owner, 2026-09-08).
  const secondPlay = [...firstPlay, modifier(2, windowId)]
  await act(async () => { rerender(ui(rolling, secondPlay)) })
  expect(challenge.currentTime).toBe(8)
  expect(gameplay.currentTime).toBe(42)
  expect(gameplay.paused).toBe(true)

  challenge.currentTime = 6
  await act(async () => { rerender(ui(idle, secondPlay)) })
  act(() => { jest.advanceTimersByTime(1024) })
  expect(gameplay.paused).toBe(false)
  expect(gameplay.currentTime).toBe(42)
  expect(challenge.paused).toBe(true)
  await act(async () => { rerender(ui(challengeStarted, secondPlay)) })
  expect(challenge.currentTime).toBe(0)
})

test('a modifier leaves the running challenge track alone, and so do gestures and volume', async () => {
  jest.useFakeTimers()
  const ui = (log: GameLogEntry[]) => <AudioProvider><GameAudio view={challengeStarted} log={log} /></AudioProvider>
  const { rerender } = render(ui([]))
  await act(async () => {})
  act(() => { jest.advanceTimersByTime(1024) })
  const challenge = FakeAudio.instances[1]
  challenge.currentTime = 11
  fireEvent.click(screen.getByRole('button', { name: 'Mute sound' }))
  await act(async () => { rerender(ui([modifier(1, challengeStarted.pendingWindows[0].windowId)])) })
  // the window is what the music is about; a card played into it is not
  expect(challenge.currentTime).toBe(11)
  expect(challenge.volume).toBe(0)
  challenge.currentTime = 3
  fireEvent.click(screen.getByRole('button', { name: 'Unmute sound' }))
  await act(async () => { fireEvent.pointerDown(document) })
  expect(challenge.currentTime).toBe(3)
})

test('rapid music changes reverse smoothly and volume or mute changes preserve the mix', async () => {
  jest.useFakeTimers()
  const ui = (view: PlayerView) => <AudioProvider><GameAudio view={view} /></AudioProvider>
  const { rerender, unmount } = render(ui(midGame))
  await act(async () => {})
  const [gameplay, challenge] = FakeAudio.instances
  await act(async () => { rerender(ui(challengeStarted)) })
  act(() => { jest.advanceTimersByTime(400) })
  const before = [gameplay.volume, challenge.volume]
  await act(async () => { rerender(ui(midGame)) })
  expect([gameplay.volume, challenge.volume]).toEqual(before)
  fireEvent.change(screen.getByRole('slider'), { target: { value: '100' } })
  expect(gameplay.volume).toBeCloseTo(before[0] * 2)
  expect(challenge.volume).toBeCloseTo(before[1] * 2)
  fireEvent.click(screen.getByRole('button', { name: 'Mute sound' }))
  act(() => { jest.advanceTimersByTime(400) })
  expect([gameplay.volume, challenge.volume]).toEqual([0, 0])
  fireEvent.click(screen.getByRole('button', { name: 'Unmute sound' }))
  expect(gameplay.volume + challenge.volume).toBeCloseTo(0.28)
  expect(challenge.volume).toBeLessThan(before[1] * 2)
  unmount()
  act(() => { jest.advanceTimersByTime(2000) })
  expect(FakeAudio.instances.every((audio) => audio.paused)).toBe(true)
  expect(jest.getTimerCount()).toBe(0)
})

test('blocked incoming music leaves the old track playing until playback can begin', async () => {
  jest.useFakeTimers()
  const ui = (view: PlayerView) => <AudioProvider><GameAudio view={view} /></AudioProvider>
  const { rerender } = render(ui(midGame))
  const [gameplay, challenge] = FakeAudio.instances
  challenge.play.mockRejectedValueOnce(new Error('NotAllowedError'))
  await act(async () => { rerender(ui(challengeStarted)) })
  act(() => { jest.advanceTimersByTime(2000) })
  expect(gameplay.paused).toBe(false)
  expect(gameplay.volume).toBeCloseTo(0.14)
  expect(challenge.volume).toBe(0)
  await act(async () => { fireEvent.pointerDown(document) })
  act(() => { jest.advanceTimersByTime(1024) })
  expect(gameplay.paused).toBe(true)
  expect(challenge.volume).toBeCloseTo(0.14)
})

test('hiding the page cancels a fade; returning fades in only the current track', async () => {
  jest.useFakeTimers()
  const hidden = jest.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const ui = (view: PlayerView) => <AudioProvider><GameAudio view={view} /></AudioProvider>
  const { rerender } = render(ui(midGame))
  await act(async () => { rerender(ui(challengeStarted)) })
  act(() => { jest.advanceTimersByTime(400) })
  hidden.mockReturnValue(true)
  fireEvent(document, new Event('visibilitychange'))
  expect(FakeAudio.instances.every((audio) => audio.paused)).toBe(true)
  expect(jest.getTimerCount()).toBe(0)
  hidden.mockReturnValue(false)
  await act(async () => { fireEvent(document, new Event('visibilitychange')) })
  act(() => { jest.advanceTimersByTime(1024) })
  expect(FakeAudio.instances[0].paused).toBe(true)
  expect(FakeAudio.instances[1].paused).toBe(false)
  expect(FakeAudio.instances[1].volume).toBeCloseTo(0.14)
})

test('invalid saved volume recovers, endpoints clip the fill, and plus clamps at 100', () => {
  localStorage.setItem('htsr.volume', 'broken')
  const { container } = render(<AudioProvider><VolumeControl /></AudioProvider>)
  expect(screen.getByRole('slider')).toHaveValue('50')
  fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } })
  expect((container.querySelector('.volume-fill') as HTMLElement).style.clipPath).toBe('inset(0 100% 0 0)')
  fireEvent.change(screen.getByRole('slider'), { target: { value: '95' } })
  fireEvent.click(screen.getByRole('button', { name: 'Increase volume' }))
  expect(screen.getByRole('slider')).toHaveValue('100')
  expect((container.querySelector('.volume-fill') as HTMLElement).style.clipPath).toBe('inset(0 0% 0 0)')
})

test('blocked autoplay retries on interaction without replaying old effects', async () => {
  const { unmount } = render(<AudioProvider><GameAudio /></AudioProvider>)
  await act(async () => {})
  const gameplay = FakeAudio.instances[0]
  gameplay.paused = true
  gameplay.play.mockRejectedValueOnce(new Error('NotAllowedError'))
  await act(async () => { fireEvent.pointerDown(document) })
  fireEvent.keyDown(document, { key: 'Enter' })
  await act(async () => {})
  expect(gameplay.paused).toBe(false)
  expect(oneShots()).toHaveLength(0)
  unmount()
})
