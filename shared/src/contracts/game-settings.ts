import { z } from "zod";

// ---------------------------------------------------------------------------
// The table's settings as the LOBBY edits them: what the host's dropdowns
// hold, what `GET /lobby` shows every seat, and what the lobby hands the
// game server with the seats. Shape only — the game server turns it into
// the engine's `GameConfig` (`game-server/game-config-for.ts`).
//
// A preset is DERIVED, never stored: the settings either equal one of the
// two named tables below or they are "custom". The client shows that name
// in its preset dropdown and picking a preset sends that table whole.
// ---------------------------------------------------------------------------

export const MIN_PLAYER_COUNT = 2;
export const MAX_PLAYER_COUNT = 4;

/** How the two printed win conditions combine: either one ends the game, or both must stand. */
export const WinConditionModeSchema = z.enum([
  "monstersOrClasses",
  "monstersAndClasses",
]);
export type WinConditionMode = z.infer<typeof WinConditionModeSchema>;

export const CardSetSchema = z.enum(["base"]);
export type CardSet = z.infer<typeof CardSetSchema>;

export const GameSettingsSchema = z.object({
  /** Seats at the table; the ready list holds at most this many. */
  playerCount: z.number().int().min(MIN_PLAYER_COUNT).max(MAX_PLAYER_COUNT),
  winCondition: WinConditionModeSchema,
  /** Monsters a party must slay. */
  monsterCount: z.number().int().min(2).max(5),
  cardSet: CardSetSchema,
  /** A turn's clock, paused while any reaction window is open. When it lapses the turn ends. */
  turnTimeMs: z.number().int().min(10_000).max(120_000),
  /** `TimeControl.reactionCountdownMs`: a full-share reaction window's wait. */
  reactionTimeMs: z.number().int().min(5_000).max(30_000),
  /** The active player keeps playing under open reaction windows (docs/SEAMLESS_REACTIONS_PLAN.md). */
  seamlessReactions: z.boolean(),
});
export type GameSettings = z.infer<typeof GameSettingsSchema>;

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  playerCount: 4,
  winCondition: "monstersOrClasses",
  monsterCount: 3,
  cardSet: "base",
  turnTimeMs: 60_000,
  reactionTimeMs: 15_000,
  seamlessReactions: false,
};

/** The default table on shorter clocks. */
export const FAST_GAME_SETTINGS: GameSettings = {
  ...DEFAULT_GAME_SETTINGS,
  turnTimeMs: 30_000,
  reactionTimeMs: 7_500,
};

export const GAME_SETTING_PRESETS = {
  default: DEFAULT_GAME_SETTINGS,
  fast: FAST_GAME_SETTINGS,
} as const;
export type GameSettingsPreset = keyof typeof GAME_SETTING_PRESETS | "custom";

/** The preset these settings ARE, or "custom" when they match neither. */
export function presetOf(settings: GameSettings): GameSettingsPreset {
  for (const [name, preset] of Object.entries(GAME_SETTING_PRESETS)) {
    if (sameSettings(settings, preset)) return name as GameSettingsPreset;
  }
  return "custom";
}

function sameSettings(a: GameSettings, b: GameSettings): boolean {
  return (Object.keys(GameSettingsSchema.shape) as (keyof GameSettings)[]).every(
    (key) => a[key] === b[key],
  );
}
