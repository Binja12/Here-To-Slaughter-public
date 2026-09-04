export type Account = { accountId: string; username: string }

export type Credentials = { username: string; password: string }

export type LobbyPlayer = { accountId: string; username: string }

// --- Game settings — mirrors shared/src/contracts/game-settings.ts --------

export type WinConditionMode = 'monstersOrClasses' | 'monstersAndClasses'

export type CardSet = 'base'

/** The table as the host sets it. Sent whole on every change (`PUT /lobby/settings`). */
export type GameSettings = {
  /** Seats at the table; the ready list holds at most this many. */
  playerCount: number
  winCondition: WinConditionMode
  /** Monsters a party must slay. */
  monsterCount: number
  cardSet: CardSet
  turnTimeMs: number
  reactionTimeMs: number
  /** The active player keeps playing under open reaction windows. */
  seamlessReactions: boolean
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  playerCount: 4,
  winCondition: 'monstersOrClasses',
  monsterCount: 3,
  cardSet: 'base',
  turnTimeMs: 60_000,
  reactionTimeMs: 15_000,
  seamlessReactions: false,
}

/** The default table on shorter clocks. */
export const FAST_GAME_SETTINGS: GameSettings = {
  ...DEFAULT_GAME_SETTINGS,
  turnTimeMs: 30_000,
  reactionTimeMs: 7_500,
}

export const GAME_SETTING_PRESETS = {
  default: DEFAULT_GAME_SETTINGS,
  fast: FAST_GAME_SETTINGS,
} as const

export type GameSettingsPreset = keyof typeof GAME_SETTING_PRESETS | 'custom'

/** The preset these settings ARE, or 'custom' when they match neither. Derived, never stored. */
export function presetOf(settings: GameSettings): GameSettingsPreset {
  for (const [name, preset] of Object.entries(GAME_SETTING_PRESETS)) {
    if (sameSettings(settings, preset)) return name as GameSettingsPreset
  }
  return 'custom'
}

function sameSettings(a: GameSettings, b: GameSettings): boolean {
  return (Object.keys(DEFAULT_GAME_SETTINGS) as (keyof GameSettings)[]).every(
    (key) => a[key] === b[key],
  )
}

export type LobbySnapshot = {
  readyPlayers: LobbyPlayer[]
  settings: GameSettings
  self: LobbyPlayer & {
    state: 'IDLE' | 'READY' | 'IN_GAME'
    isHost: boolean
  }
}

export type StartGameResult = { gameId: string; status: 'STARTING' }

export type GameAssigned = { gameId: string; webSocketUrl: string }

export type LobbyFailure = { reason: string }
