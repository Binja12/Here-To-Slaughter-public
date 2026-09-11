import { FakeLobbyPort } from './FakeLobbyPort'
import { LobbyPort } from './LobbyPort'
import { RealLobbyPort } from './RealLobbyPort'

const useFakes = process.env.REACT_APP_FAKE_SERVER === '1'

export const createLobbyPort = (): LobbyPort =>
  useFakes ? new FakeLobbyPort() : new RealLobbyPort()
