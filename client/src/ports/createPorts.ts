import { FakeGamePort } from './FakeGamePort'
import { FakeLobbyPort } from './FakeLobbyPort'
import { GamePort } from './GamePort'
import { LobbyPort } from './LobbyPort'
import { RealGamePort } from './RealGamePort'
import { RealLobbyPort } from './RealLobbyPort'

const useFakes = process.env.REACT_APP_FAKE_SERVER === '1'

export const createLobbyPort = (): LobbyPort =>
  useFakes ? new FakeLobbyPort() : new RealLobbyPort()

export const createGamePort = (): GamePort =>
  useFakes ? new FakeGamePort() : new RealGamePort()
