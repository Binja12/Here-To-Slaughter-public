import { IAbilityRule } from '../../interfaces'
import { ChallengeAbility } from './challenge-ability'
import { CharismaticSongAbility } from './charismatic-song-ability'
import { AbyssQueenAbility } from './abyss-queen-ability'
import { CloakedSageAbility } from './cloaked-sage-ability'
import { CurseOfTheSnakesEyesAbility } from './curse-of-the-snakes-eyes-ability'
import { CriticalBoostAbility } from './critical-boost-ability'
import { DestructiveSpellAbility } from './destructive-spell-ability'
import { EnchantedSpellAbility } from './enchanted-spell-ability'
import { ForcedExchangeAbility } from './forced-exchange-ability'
import { DivineArrowAbility } from './divine-arrow-ability'
import { FistOfReasonAbility } from './fist-of-reason-ability'
import { MalamammothAbility } from './malamammoth-ability'
import { MegaSlimeAbility } from './mega-slime-ability'
import { OrthusAbility } from './orthus-ability'
import { ParticularlyRustyCoinAbility } from './particularly-rusty-coin-ability'
import { SealingKeyAbility } from './sealing-key-ability'
import { ModifierAbility } from './modifier-ability'
import { ProtectingHornAbility } from './protecting-horn-ability'
import { ShadowClawAbility } from './shadow-claw-ability'
import { WarwornOwlbearAbility } from './warworn-owlbear-ability'
import { ReallyBigRingAbility } from './really-big-ring-ability'
import { SuspiciouslyShinyCoinAbility } from './suspiciously-shiny-coin-ability'
import { SnowballAbility } from './snowball-ability'
import { WigglesAbility } from './wiggles-ability'
import { WiseShieldAbility } from './wise-shield-ability'

// Not keyed by a card id — the rules a card gets from its position. Re-exported
// so TaskManager reaches every table through this file.
export { heroRules, OFFERS_ROLL } from './hero-rules'
export { instanceRules } from './instance-rules'

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
//
// Sectioned by card type in the order `data/base-game-cards.ts` declares them,
// and sorted by id inside each section. The id ranges below are that file's,
// so a missing section header means no card of that type has behaviour yet.
// ---------------------------------------------------------------------------

/**
 * Every id in the list gets the same declaration. Card ids are per COPY, so
 * identical printed cards are many ids and one behaviour — the ids stay
 * written out, because "which cards have behaviour" has to be greppable.
 */
const allOf = (
  ids: string[],
  ability: IAbilityRule[],
): [string, IAbilityRule[]][] => ids.map((id) => [id, ability])

export const abilityRegistry: ReadonlyMap<string, IAbilityRule[]> = new Map<
  string,
  IAbilityRule[]
>([
  // =========================================================================
  // HEROES — hero-001 … hero-048
  // =========================================================================
  // A card holds a LIST of entries — one per stretch of steps that runs
  // without pausing. See wiggles-ability.ts for the split.
  ['hero-028', WiseShieldAbility], // Wise Shield — +3 to your rolls until end of turn
  ['hero-036', WigglesAbility], // Wiggles — STEAL a Hero, then may roll on it
  ['hero-040', SnowballAbility], // Snowball — DRAW; if Magic, may play it and DRAW

  // =========================================================================
  // MONSTERS — monster-122 … monster-136
  // =========================================================================
  // Every monster passive installs on MonsterSlain and never expires: the
  // monster is in the party before that event goes out, and it never leaves.
  ['monster-123', MegaSlimeAbility], // Mega Slime — +1 action point each turn
  ['monster-129', AbyssQueenAbility], // Abyss Queen — +1 answering a hostile Modifier
  ['monster-131', OrthusAbility], // Orthus — DRAW a Magic card, may play it at once
  ['monster-134', MalamammothAbility], // Malamammoth — DRAW an Item card, may play it at once
  ['monster-135', WarwornOwlbearAbility], // Warworn Owlbear — your Items cannot be challenged

  // =========================================================================
  // ITEMS — item-062 … item-076
  // =========================================================================
  // Card ids are per COPY: two printed Really Big Rings are two entries.
  ['item-062', ParticularlyRustyCoinAbility], // Particularly Rusty Coin — DRAW on a failed roll
  ['item-063', ParticularlyRustyCoinAbility],
  ['item-064', ReallyBigRingAbility], // Really Big Ring — +2 to the carrier's rolls
  ['item-065', ReallyBigRingAbility],
  // Cursed: played onto an opponent's hero, and it taxes THEIR roll.
  ['item-073', SuspiciouslyShinyCoinAbility], // Suspiciously Shiny Coin — DISCARD on a successful roll
  ['item-074', CurseOfTheSnakesEyesAbility], // Curse of the Snake's Eyes — -2 to the carrier's rolls
  ['item-075', CurseOfTheSnakesEyesAbility],
  ['item-076', SealingKeyAbility], // Sealing Key — the carrier's effect cannot be used

  // =========================================================================
  // MAGIC — magic-049 … magic-061
  // =========================================================================
  ['magic-049', DestructiveSpellAbility], // Destructive Spell — DISCARD 1, then DESTROY a hero
  ['magic-050', DestructiveSpellAbility],
  ['magic-053', CriticalBoostAbility], // Critical Boost — DRAW 3, DISCARD 1
  ['magic-054', CriticalBoostAbility],
  ['magic-055', EnchantedSpellAbility], // Enchanted Spell — +2 to all your rolls this turn
  ['magic-056', EnchantedSpellAbility],
  ['magic-057', ForcedExchangeAbility], // Forced Exchange — choose a player, STEAL from them

  // =========================================================================
  // MODIFIERS — modifier-077 … modifier-101
  // =========================================================================
  // One declaration, 25 copies: the numbers each is printed with are card
  // data, read by ChooseValueTask at runtime.
  ...allOf(
    [
      'modifier-077', 'modifier-078', 'modifier-079', 'modifier-080',
      'modifier-081', 'modifier-082', 'modifier-083', 'modifier-084',
      'modifier-085', 'modifier-086', 'modifier-087', 'modifier-088',
      'modifier-089', 'modifier-090', 'modifier-091', 'modifier-092',
      'modifier-093', 'modifier-094', 'modifier-095', 'modifier-096',
      'modifier-097', 'modifier-098', 'modifier-099', 'modifier-100',
      'modifier-101',
    ],
    ModifierAbility,
  ),

  // =========================================================================
  // CHALLENGES — challenge-102 … challenge-115
  // =========================================================================
  // One declaration, 14 identical copies.
  ...allOf(
    [
      'challenge-102', 'challenge-103', 'challenge-104', 'challenge-105',
      'challenge-106', 'challenge-107', 'challenge-108', 'challenge-109',
      'challenge-110', 'challenge-111', 'challenge-112', 'challenge-113',
      'challenge-114', 'challenge-115',
    ],
    ChallengeAbility,
  ),

  // =========================================================================
  // LEADERS — leader-116 … leader-121
  // =========================================================================
  // The three roll-bonus passives install on GameStarted and never expire —
  // a leader has no card movement for a printed passive to hang off.
  ['leader-116', DivineArrowAbility], // The Divine Arrow — +1 to your ATTACK rolls
  // The one ACTIVATED leader. RollOnLeaderAction is what prices it, limits it
  // to one a turn and announces the RollSuccess this triggers on.
  ['leader-117', ShadowClawAbility], // The Shadow Claw — pull a card from a hand
  ['leader-118', FistOfReasonAbility], // The Fist of Reason — +2 to your CHALLENGE rolls
  ['leader-119', CharismaticSongAbility], // The Charismatic Song — +1 to your hero-effect rolls
  ['leader-120', CloakedSageAbility], // The Cloaked Sage — DRAW on each Magic card you play
  ['leader-121', ProtectingHornAbility], // The Protecting Horn — +1 or -1 on each Modifier you play
])
