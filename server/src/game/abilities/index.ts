import { IAbility } from '../interfaces'
import { SnowballAbility } from './snowball-ability'
import { WigglesAbility } from './wiggles-ability'
import { WiseShieldAbility } from './wise-shield-ability'

// ---------------------------------------------------------------------------
// Ability registry — card BEHAVIOUR, keyed by card id.
//
// Card *data* (shared/src/types.ts) is display text and rule numbers only. The
// behaviour lives here, on the server, for three reasons:
//
//   1. `steps` are live ITask instances constructed at module load. They cannot
//      survive `clone()`, and GameState is cloned on every frame.
//   2. Nothing off-server may see a card's pipeline; the client renders
//      `description` and learns the rest from events.
//   3. Keying by id keeps one lookup table to audit — "which cards have
//      behaviour" is a single file, not a field scattered across 136 records.
//
// A card id absent from this map simply has no ability: the processor skips it.
// ---------------------------------------------------------------------------

export const abilityRegistry: ReadonlyMap<string, IAbility[]> = new Map<
  string,
  IAbility[]
>([
  // A card holds a LIST of entries — one per stretch of steps that runs
  // without pausing. See wiggles-ability.ts for the split.
  ['hero-036', WigglesAbility], // Wiggles — STEAL a Hero, then may roll on it
  ['hero-040', SnowballAbility], // Snowball — DRAW; if Magic, may DRAW again
  ['hero-028', WiseShieldAbility], // Wise Shield — +3 to your rolls until end of turn
])
