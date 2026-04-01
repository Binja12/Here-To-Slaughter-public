import { GameConfig } from 'shared'

export const defaultGameConfig: GameConfig = {
  playerCount: { min: 2, max: 4 },
  startingHandSize: 5,
  actionPointsPerTurn: 3,
  cardSets: ['base'],
  winConditions: ['SlayThreeMonsters', 'SixDifferentClasses'],
  timeControl: 5000, // 5 seconds reaction window
}
