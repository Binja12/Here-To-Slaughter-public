import { renderHook, act } from '@testing-library/react'
import { gameImageFiles, useAssetWarmup } from './warmup'
import { catalog } from './catalog'
import { backgroundTraffic } from './traffic'

jest.mock('../lobby/LobbyView', () => () => null)
jest.mock('../GameScreen', () => () => null)
jest.mock('./traffic', () => ({ backgroundTraffic: { setEnabled: jest.fn(), request: jest.fn(async () => new Blob()) } }))

test('lobby warms game art before music, stops for connection, then resumes the library on the board', () => {
  jest.useFakeTimers()
  ;(backgroundTraffic.request as jest.Mock).mockResolvedValue(new Blob())
  const card = '/board/heroes/Hero Test.png'
  catalog.images[card] = { full: '/card.webp', variants: [[1080, '/card.webp']] }
  catalog.music['/music/Gameplay Music.mp3'] = [{ url: '/first.mp3', startSeconds: 0, durationSeconds: 300 }]
  localStorage.setItem('htsr.volume', '50')
  const { rerender, unmount } = renderHook(({ phase }) => useAssetWarmup(phase), { initialProps: { phase: 'lobby' as 'lobby' | 'game' | 'game-connecting' } })
  try {
    act(() => { jest.advanceTimersByTime(500) })
    const calls = (backgroundTraffic.request as jest.Mock).mock.calls
    const image = calls.find(([url]) => url === '/card.webp')!
    const music = calls.find(([url]) => url === '/first.mp3')!
    expect(image).toBeDefined()
    expect(music).toBeDefined()
    expect(image[1]).toBeLessThan(music[1])
    rerender({ phase: 'game-connecting' })
    expect(image[2].aborted).toBe(true)
    expect(music[2].aborted).toBe(true)
    const before = calls.length
    act(() => { jest.advanceTimersByTime(500) })
    expect(backgroundTraffic.setEnabled).toHaveBeenLastCalledWith(false)
    expect(calls).toHaveLength(before)
    rerender({ phase: 'game' })
    act(() => { jest.advanceTimersByTime(500) })
    expect(backgroundTraffic.setEnabled).toHaveBeenLastCalledWith(true)
    expect(calls.slice(before).some(([url]) => url === '/card.webp')).toBe(true)
    expect(calls.slice(before).some(([url]) => url === '/first.mp3')).toBe(false)
  } finally {
    unmount()
    delete catalog.images[card]
    delete catalog.music['/music/Gameplay Music.mp3']
    localStorage.clear()
    jest.useRealTimers()
  }
})

test('background card order depends only on the public filename catalog', () => {
  const names = ['/board/heroes/Z.png', '/board/heroes/A.png', '/board/heroes/M.png']
  const add = (name: string) => { catalog.images[name] = { full: name, variants: [] } }
  try {
    names.forEach(add)
    const first = gameImageFiles()
    names.forEach(name => { delete catalog.images[name] })
    names.slice().reverse().forEach(add)
    expect(gameImageFiles()).toEqual(first)
    expect(first).toEqual([...first].sort())
    expect(first.filter(name => names.includes(name))).toEqual([...names].sort())
  } finally { names.forEach(name => { delete catalog.images[name] }) }
})
