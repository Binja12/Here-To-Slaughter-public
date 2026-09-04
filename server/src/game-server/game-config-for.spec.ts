import { DEFAULT_GAME_SETTINGS, FAST_GAME_SETTINGS, WinConditionType } from 'shared'
import type { GameSettings } from 'shared'
import { defaultGameConfig } from '../game/config/game-config'
import { gameConfigFor } from './game-config-for'

const custom = (overrides: Partial<GameSettings>): GameSettings => ({
  ...DEFAULT_GAME_SETTINGS,
  ...overrides,
})

describe('gameConfigFor', () => {
  it('turns the default settings into the engine config on the lobby clocks', () => {
    const config = gameConfigFor(DEFAULT_GAME_SETTINGS)

    expect(config.playerCount).toEqual({ min: 2, max: 4 })
    expect(config.cardSets).toEqual(['base'])
    expect(config.winConditions).toEqual([
      { type: WinConditionType.SlayMonsters, value: 3 },
      { type: WinConditionType.PartyClasses, value: 6 },
    ])
    expect(config.timeControl).toMatchObject({
      name: 'default',
      reactionCountdownMs: 15_000,
      turnTimeMs: 60_000,
    })
    // What the settings do not name, the engine's default keeps.
    expect(config.startingHandSize).toBe(defaultGameConfig.startingHandSize)
    expect(config.actionPointsPerTurn).toBe(defaultGameConfig.actionPointsPerTurn)
  })

  it('names the fast preset and its shorter clocks', () => {
    expect(gameConfigFor(FAST_GAME_SETTINGS).timeControl).toMatchObject({
      name: 'fast',
      reactionCountdownMs: 7_500,
      turnTimeMs: 30_000,
    })
  })

  it('seats as many as the settings say', () => {
    expect(gameConfigFor(custom({ playerCount: 3 })).playerCount).toEqual({
      min: 2,
      max: 3,
    })
  })

  it('keeps only the win conditions the settings switch on', () => {
    expect(
      gameConfigFor(custom({ winCondition: 'monsters', monsterCount: 5 })).winConditions,
    ).toEqual([{ type: WinConditionType.SlayMonsters, value: 5 }])
    expect(gameConfigFor(custom({ winCondition: 'heroes' })).winConditions).toEqual([
      { type: WinConditionType.PartyClasses, value: 6 },
    ])
    expect(gameConfigFor(custom({ winCondition: 'heroes' })).timeControl.name).toBe(
      'custom',
    )
  })
})
