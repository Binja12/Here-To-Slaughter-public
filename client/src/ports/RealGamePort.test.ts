import { RealGamePort } from './RealGamePort'
import { backgroundTraffic } from '../loading/traffic'
import { io } from 'socket.io-client'
import type { CommandResult, GameCommand } from '../contract'

jest.mock('socket.io-client', () => ({ io: jest.fn() }))
jest.mock('../loading/traffic', () => ({ backgroundTraffic: { foregroundRequest: jest.fn() } }))

const command = { commandId: 'traffic-test' } as GameCommand
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

test('background traffic yields until a game action is acknowledged', async () => {
  const release = jest.fn()
  ;(backgroundTraffic.foregroundRequest as jest.Mock).mockReturnValue(release)
  let acknowledge: (result: CommandResult) => void = () => {}
  const socket = { connected: true, on: jest.fn(), disconnect: jest.fn(), emit: jest.fn((_event, _command, ack) => { acknowledge = ack }) }
  ;(io as jest.Mock).mockReturnValue(socket)
  const port = new RealGamePort()
  const disconnect = port.connect('http://game.test', { onStarted: jest.fn(), onSnapshot: jest.fn(), onCompleted: jest.fn() })
  const sending = port.send(command)
  expect(backgroundTraffic.foregroundRequest).toHaveBeenCalledTimes(1)
  expect(release).not.toHaveBeenCalled()
  acknowledge({ commandId: command.commandId, accepted: true })
  await expect(sending).resolves.toMatchObject({ accepted: true })
  expect(release).toHaveBeenCalledTimes(1)
  disconnect()
})

test('a timed-out action retries then releases background traffic', async () => {
  jest.useFakeTimers()
  const release = jest.fn()
  ;(backgroundTraffic.foregroundRequest as jest.Mock).mockReturnValue(release)
  const socket = { connected: true, on: jest.fn(), disconnect: jest.fn(), emit: jest.fn() }
  ;(io as jest.Mock).mockReturnValue(socket)
  const port = new RealGamePort()
  const disconnect = port.connect('http://game.test', { onStarted: jest.fn(), onSnapshot: jest.fn(), onCompleted: jest.fn() })
  try {
    const sending = port.send(command)
    jest.advanceTimersByTime(5000)
    await flush()
    expect(socket.emit).toHaveBeenCalledTimes(2)
    expect(release).not.toHaveBeenCalled()
    jest.advanceTimersByTime(5000)
    await expect(sending).resolves.toMatchObject({ accepted: false, error: 'InternalError' })
    expect(release).toHaveBeenCalledTimes(1)
  } finally { disconnect(); jest.useRealTimers() }
})
