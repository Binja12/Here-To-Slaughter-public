import {
  GAME_SETTING_PRESETS,
  presetOf,
  type GameSettings,
  type GameSettingsPreset,
  type WinConditionMode,
} from '../contract'

/* ---------------------------------------------------------------------------
 * What the settings dropdowns offer. The server checks ranges only
 * (shared/src/contracts/game-settings.ts); these are the steps a host can
 * pick from. Every default and fast value is one of them, so a preset always
 * shows as a row of selectable values and never as a blank.
 * ------------------------------------------------------------------------- */

export type Option<T> = { value: T; label: string; disabled?: boolean }

export const PLAYER_COUNT_OPTIONS: Option<number>[] = [2, 3, 4].map((n) => ({
  value: n,
  label: `${n} players`,
}))

export const WIN_CONDITION_OPTIONS: Option<WinConditionMode>[] = [
  { value: 'both', label: 'Either' },
  { value: 'monsters', label: 'Monsters only' },
  { value: 'heroes', label: 'Heroes only' },
]

export const MONSTER_COUNT_OPTIONS: Option<number>[] = [2, 3, 4, 5].map((n) => ({
  value: n,
  label: `${n} monsters`,
}))

export const CARD_SET_OPTIONS: Option<GameSettings['cardSet']>[] = [
  { value: 'base', label: 'Base game' },
]

export const TURN_TIME_OPTIONS: Option<number>[] = [
  120_000, 90_000, 60_000, 45_000, 30_000, 20_000, 10_000,
].map((ms) => ({ value: ms, label: formatClock(ms) }))

export const REACTION_TIME_OPTIONS: Option<number>[] = [
  30_000, 20_000, 15_000, 10_000, 7_500, 5_000,
].map((ms) => ({ value: ms, label: formatSeconds(ms) }))

/** "On" is listed so the row reads as a switch, but nothing plays it yet. */
export const SEAMLESS_OPTIONS: Option<boolean>[] = [
  { value: false, label: 'Off' },
  { value: true, label: 'On (not yet)', disabled: true },
]

export const PRESET_OPTIONS: Option<GameSettingsPreset>[] = [
  { value: 'default', label: 'Default' },
  { value: 'fast', label: 'Fast' },
  // Never picked, only shown: it is what the row reads once a value differs.
  { value: 'custom', label: 'Custom', disabled: true },
]

/** The settings a preset stands for; a request for 'custom' changes nothing. */
export function withPreset(
  settings: GameSettings,
  preset: GameSettingsPreset,
): GameSettings {
  return preset === 'custom' ? settings : { ...GAME_SETTING_PRESETS[preset] }
}

export { presetOf }

/** 90000 → "1:30" */
export function formatClock(ms: number): string {
  const total = Math.round(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** 7500 → "7.5 s" */
export function formatSeconds(ms: number): string {
  const seconds = ms / 1000
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`
}
