import { DEFAULT_GAME_SETTINGS, FAST_GAME_SETTINGS } from '../contract'
import {
  MONSTER_COUNT_OPTIONS,
  PLAYER_COUNT_OPTIONS,
  REACTION_TIME_OPTIONS,
  TURN_TIME_OPTIONS,
  WIN_CONDITION_OPTIONS,
  formatClock,
  formatSeconds,
  presetOf,
  withPreset,
} from './gameSettings'

test('the preset is derived from the values', () => {
  expect(presetOf(DEFAULT_GAME_SETTINGS)).toBe('default')
  expect(presetOf(FAST_GAME_SETTINGS)).toBe('fast')
  expect(presetOf({ ...DEFAULT_GAME_SETTINGS, monsterCount: 4 })).toBe('custom')
  expect(presetOf({ ...FAST_GAME_SETTINGS, playerCount: 3 })).toBe('custom')
})

test('picking a preset resets every field; custom changes nothing', () => {
  const custom = { ...DEFAULT_GAME_SETTINGS, playerCount: 2, turnTimeMs: 10_000 }
  expect(withPreset(custom, 'default')).toEqual(DEFAULT_GAME_SETTINGS)
  expect(withPreset(custom, 'fast')).toEqual(FAST_GAME_SETTINGS)
  expect(withPreset(custom, 'custom')).toBe(custom)
})

test('both presets are made of offered values', () => {
  for (const settings of [DEFAULT_GAME_SETTINGS, FAST_GAME_SETTINGS]) {
    expect(PLAYER_COUNT_OPTIONS.map((o) => o.value)).toContain(settings.playerCount)
    expect(WIN_CONDITION_OPTIONS.map((o) => o.value)).toContain(settings.winCondition)
    expect(MONSTER_COUNT_OPTIONS.map((o) => o.value)).toContain(settings.monsterCount)
    expect(TURN_TIME_OPTIONS.map((o) => o.value)).toContain(settings.turnTimeMs)
    expect(REACTION_TIME_OPTIONS.map((o) => o.value)).toContain(settings.reactionTimeMs)
  }
})

test('clocks read as people say them', () => {
  expect(formatClock(120_000)).toBe('2:00')
  expect(formatClock(90_000)).toBe('1:30')
  expect(formatClock(10_000)).toBe('0:10')
  expect(formatSeconds(15_000)).toBe('15 s')
  expect(formatSeconds(7_500)).toBe('7.5 s')
})
