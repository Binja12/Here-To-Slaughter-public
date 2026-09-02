import { GameConfig, WinConditionType } from 'shared'
import { StandardTimeControl } from './time-control-config'

export const defaultGameConfig: GameConfig = {
  playerCount: { min: 2, max: 4 },
  startingHandSize: 5,
  actionPointsPerTurn: 3,
  cardSets: ['base'],
  winConditions: [
    { type: WinConditionType.SlayMonsters, value: 3 },
    { type: WinConditionType.PartyClasses, value: 6 },
  ],
  timeControl: StandardTimeControl,
  flawPlay: true,
}
