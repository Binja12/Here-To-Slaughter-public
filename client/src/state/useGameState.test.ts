import { act, renderHook } from '@testing-library/react'
import { useGameState } from './useGameState'
import type { GameEvents, GamePort } from '../ports/GamePort'
import type { CommandResult } from '../contract'

const assignment = { gameId: 'timing-test', webSocketUrl: '/' }
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(10000)
  let id = 0
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => `request-${++id}` } })
  window.__htsrNetwork = []
})
afterEach(() => {
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto)
  else Reflect.deleteProperty(globalThis, 'crypto')
  jest.useRealTimers()
})

test('tracks replies separately from game windows and omits card payloads from diagnostics', async () => {
  let reply: (value: CommandResult) => void = () => {}
  const port: GamePort = {
    connect: (_url: string, events: GameEvents) => { events.onConnectionChange?.(true); return () => {} },
    send: jest.fn(() => new Promise(resolve => { reply = resolve })),
  }
  const { result } = renderHook(() => useGameState(port, assignment))
  let sending: Promise<CommandResult> = Promise.resolve({ commandId: 'request-1', accepted: true })
  act(() => { sending = result.current.send({ type: 'PlayHero', payload: { cardId: 'private-card' } }) })
  expect(result.current.pendingSince).toBe(10000)
  expect(window.__htsrNetwork?.[0]).toMatchObject({ event: 'sent', commandType: 'PlayHero', at: 10000 })
  jest.setSystemTime(12000)
  await act(async () => { reply({ commandId: 'request-1', accepted: true }); await sending })
  expect(result.current.pendingSince).toBeNull()
  expect(window.__htsrNetwork?.[1]).toMatchObject({ event: 'reply', elapsedMs: 2000, accepted: true })
  expect(JSON.stringify(window.__htsrNetwork)).not.toContain('private-card')
})

test('a failed request clears its pending notice and records the failure', async () => {
  const port: GamePort = { connect: () => () => {}, send: jest.fn(async () => { throw new Error('disconnected') }) }
  const { result } = renderHook(() => useGameState(port, assignment))
  await act(async () => {
    await expect(result.current.send({ type: 'EndTurn', payload: {} })).rejects.toThrow('disconnected')
  })
  expect(result.current.pendingSince).toBeNull()
  expect(window.__htsrNetwork?.at(-1)).toMatchObject({ event: 'failed', commandType: 'EndTurn' })
})
