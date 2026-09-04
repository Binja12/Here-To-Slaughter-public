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
    timeControl: {
      ...defaultGameConfig.timeControl,
      name: presetOf(settings),
      reactionCountdownMs: settings.reactionTimeMs,
      turnTimeMs: settings.turnTimeMs,
    },
  }
}

/** "Heroes" is a hero of every class the game has; the engine caps it there. */
function winConditionsFor(settings: GameSettings): WinConditionConfig[] {
  const monsters: WinConditionConfig = {
    type: WinConditionType.SlayMonsters,
    value: settings.monsterCount,
  }
  const heroes: WinConditionConfig = {
    type: WinConditionType.PartyClasses,
    value: Object.values(HeroClass).length,
  }
  switch (settings.winCondition) {
    case 'both':
      return [monsters, heroes]
    case 'monsters':
      return [monsters]
    case 'heroes':
      return [heroes]
  }
  const unhandled: never = settings.winCondition
  throw new Error(`gameConfigFor: no win conditions for ${String(unhandled)}`)
}
