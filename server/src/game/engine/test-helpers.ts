// test-helpers.ts
import { GameConfig } from 'shared'
import { GameState } from './game-state'
import { defaultGameConfig } from './game-config'
import { Player } from '../player'
import { Party } from '../party'
export function makeTestGameState(
  overrides?: Partial<GameConfig>,
  players?: Player[],
  parties?: Party[],
): GameState {
  const config = overrides
    ? { ...defaultGameConfig, ...overrides }
    : defaultGameConfig

  const testPlayers = players ?? [
    new Player({
      id: 'player-1',
      name: 'Alice',
      hand: [],
      partyId: 'party-1',
      actionPointsPerTurn: 3,
    }),
    new Player({
      id: 'player-2',
      name: 'Bob',
      hand: [],
      partyId: 'party-2',
      actionPointsPerTurn: 3,
    }),
  ]

  const testParties = parties ?? [
    new Party({
      playerId: 'player-1',
      leaderId: 'leader-115',
      heroIds: [],
      monsterIds: [],
    }),
    new Party({
      playerId: 'player-2',
      leaderId: 'leader-116',
      heroIds: [],
      monsterIds: [],
    }),
  ]

  return new GameState(config, testPlayers, testParties)
}
