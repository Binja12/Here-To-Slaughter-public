import { HeroClass, MIN_PLAYER_COUNT, WinConditionType, presetOf } from 'shared'
import type { GameConfig, GameSettings, WinConditionConfig } from 'shared'
import { defaultGameConfig } from '../game/config/game-config'

// ---------------------------------------------------------------------------
// The lobby's settings (`shared/src/contracts/game-settings.ts`) become the
// engine's `GameConfig` here and nowhere else. What the settings do not
// name — hand size, action points — the engine's default config keeps.
// ---------------------------------------------------------------------------

export function gameConfigFor(settings: GameSettings): GameConfig {
  return {
    ...defaultGameConfig,
    playerCount: { min: MIN_PLAYER_COUNT, max: settings.playerCount },
    cardSets: [settings.cardSet],
    winConditions: winConditionsFor(settings),
    requireAllWinConditions: settings.winCondition === 'monstersAndClasses',
    timeControl: {
      ...defaultGameConfig.timeControl,
      name: presetOf(settings),
      reactionCountdownMs: settings.reactionTimeMs,
      turnTimeMs: settings.turnTimeMs,
    },
  }
}

/** Both printed conditions, always; `requireAllWinConditions` says whether a party needs one or both. */
function winConditionsFor(settings: GameSettings): WinConditionConfig[] {
  return [
    { type: WinConditionType.SlayMonsters, value: settings.monsterCount },
    {
      type: WinConditionType.PartyClasses,
      value: Object.values(HeroClass).length,
    },
  ]
}
