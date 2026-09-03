import { FakeLobbyPort } from './FakeLobbyPort'

test('fake lobby supports the offline auth and ready flow', async () => {
  const port = new FakeLobbyPort()
  await expect(port.getLobby()).rejects.toMatchObject({ reason: 'Unauthorized' })

  await port.login({ username: 'Ada', password: 'secret' })
  const lobby = await port.getLobby()
  expect(lobby.self).toMatchObject({ username: 'Ada', state: 'READY', isHost: true })
  expect(lobby.readyPlayers).toHaveLength(4)

  expect(await port.startGame()).toEqual({ gameId: 'fake-game', status: 'STARTING' })
})
