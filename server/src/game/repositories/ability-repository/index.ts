import { GameEventType, TriggerScope } from 'shared'
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
import { MightyBladeAbility } from './mighty-blade-ability'
import { TerratugaAbility } from './terratuga-ability'
import { MaskAbility } from './mask-ability'
import { LookieRookieAbility } from './lookie-rookie-ability'
import { GuidingLightAbility } from './guiding-light-ability'
import { RadiantHornAbility } from './radiant-horn-ability'
import { BunBunAbility } from './bun-bun-ability'
import { CallToTheFallenAbility } from './call-to-the-fallen-ability'
import { HolyCurselifterAbility } from './holy-curselifter-ability'
import { WindsOfChangeAbility } from './winds-of-change-ability'
import { ForcefulWindsAbility } from './forceful-winds-ability'
import { HeavyBearAbility } from './heavy-bear-ability'
import { HopperAbility } from './hopper-ability'
import { ToughTeddyAbility } from './tough-teddy-ability'
import { SpookyAbility } from './spooky-ability'
import { GreedyCheeksAbility } from './greedy-cheeks-ability'
import { SmoothMimimeowAbility } from './smooth-mimimeow-ability'
import { FuryKnuckleAbility } from './fury-knuckle-ability'
import { BearClawAbility } from './bear-claw-ability'
import { WilyRedAbility } from './wily-red-ability'
import { PlunderingPumaAbility } from './plundering-puma-ability'
import { TipsyTootieAbility } from './tipsy-tootie-ability'
import { BloodwingAbility } from './bloodwing-ability'
import { CorruptedSabretoothAbility } from './corrupted-sabretooth-ability'
import { DecoyDollAbility } from './decoy-doll-ability'
import { SharpFoxAbility } from './sharp-fox-ability'
import { BullseyeAbility } from './bullseye-ability'
import { BearyWiseAbility } from './beary-wise-ability'
import { QiBearAbility } from './qi-bear-ability'
import { HookAbility } from './hook-ability'
import { ShurikittyAbility } from './shurikitty-ability'
import { DodgyDealerAbility } from './dodgy-dealer-ability'
import { CrownedSerpentAbility } from './crowned-serpent-ability'
import { SlipperyPawsAbility } from './slippery-paws-ability'
import { SilentShadowAbility } from './silent-shadow-ability'
import { BadAxeAbility } from './bad-axe-ability'
import { PanChucksAbility } from './pan-chucks-ability'
import { SeriousGreyAbility } from './serious-grey-ability'
import { QuickDrawAbility } from './quick-draw-ability'
import { WildshotAbility } from './wildshot-ability'
import { KitNapperAbility } from './kit-napper-ability'
import { SlyPickingsAbility } from './sly-pickings-ability'
import { MeowzioAbility } from './meowzio-ability'
import { VibrantGlowAbility } from './vibrant-glow-ability'
import { IronResolveAbility } from './iron-resolve-ability'
import { CalmingVoiceAbility } from './calming-voice-ability'
import { ButtonsAbility } from './buttons-ability'
import { WhiskersAbility } from './whiskers-ability'
import { FluffyAbility } from './fluffy-ability'
import { MellowDeeAbility } from './mellow-dee-ability'
import { LuckyBuckyAbility } from './lucky-bucky-ability'
import { FuzzyCheeksAbility } from './fuzzy-cheeks-ability'
import { NappingNibblesAbility } from './napping-nibbles-ability'
import { PeanutAbility } from './peanut-ability'
import { AnuranCauldronAbility } from './anuran-cauldron-ability'
import { DracosAbility } from './dracos-ability'
import { ArcticAriesAbility } from './arctic-aries-ability'
import { RexMajorAbility } from './rex-major-ability'
import { DarkDragonKingAbility } from './dark-dragon-king-ability'
import { TitanWyvernAbility } from './titan-wyvern-ability'
import { EntanglingTrapAbility } from './entangling-trap-ability'

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
  ['hero-001', BadAxeAbility], // Bad Axe — DESTROY a Hero
  ['hero-002', FuryKnuckleAbility], // Fury Knuckle — pull; a Challenge card pulls a second
  ['hero-008', PanChucksAbility], // Pan Chucks — DRAW 2; Challenge may DESTROY
  ['hero-009', SeriousGreyAbility], // Serious Grey — DESTROY, then DRAW
  ['hero-010', QuickDrawAbility], // Quick Draw — DRAW 2; Item may be played
  ['hero-012', WildshotAbility], // Wildshot — DRAW 3, DISCARD 1
  ['hero-014', BullseyeAbility], // Bullseye — the top three, one to hand, the rest reordered
  ['hero-015', WilyRedAbility], // Wily Red — DRAW until you hold 7
  ['hero-016', SharpFoxAbility], // Sharp Fox — look at a hand
  ['hero-017', KitNapperAbility], // Kit Napper — STEAL a Hero
  ['hero-018', SlyPickingsAbility], // Sly Pickings — pull; Item may be played
  ['hero-019', MeowzioAbility], // Meowzio — STEAL and pull from one player
  ['hero-020', PlunderingPumaAbility], // Plundering Puma — pull 2; that player may DRAW
  ['hero-004', HeavyBearAbility], // Heavy Bear — a chosen player DISCARDS 2
  ['hero-005', BearClawAbility], // Bear Claw — pull; a Hero card pulls a second
  ['hero-006', ToughTeddyAbility], // Tough Teddy — each other player with a Fighter DISCARDS
  ['hero-011', LookieRookieAbility], // Lookie Rookie — an Item card from the discard pile
  ['hero-021', SilentShadowAbility], // Silent Shadow — look at a hand, take a card
  ['hero-024', SmoothMimimeowAbility], // Smooth Mimimeow — pull from each other player with a Thief
  ['hero-025', GuidingLightAbility], // Guiding Light — a Hero card from the discard pile
  ['hero-026', HolyCurselifterAbility], // Holy Curselifter — a cursed item off your hero, to hand
  ['hero-027', RadiantHornAbility], // Radiant Horn — a Modifier card from the discard pile
  ['hero-028', WiseShieldAbility], // Wise Shield — +3 to your rolls until end of turn
  ['hero-031', MightyBladeAbility], // Mighty Blade — your heroes cannot be destroyed until your next turn
  ['hero-033', HopperAbility], // Hopper — a chosen player SACRIFICES a hero
  ['hero-035', SpookyAbility], // Spooky — each other player SACRIFICES a hero
  ['hero-029', VibrantGlowAbility], // Vibrant Glow — +5 to your rolls this turn
  ['hero-030', IronResolveAbility], // Iron Resolve — your plays cannot be challenged
  ['hero-032', CalmingVoiceAbility], // Calming Voice — your Heroes cannot be stolen
  ['hero-034', ButtonsAbility], // Buttons — pull; Magic may be played
  ['hero-036', WigglesAbility], // Wiggles — STEAL a Hero, then may roll on it
  ['hero-039', BunBunAbility], // Bun Bun — a Magic card from the discard pile
  ['hero-037', WhiskersAbility], // Whiskers — STEAL, then DESTROY
  ['hero-038', FluffyAbility], // Fluffy — DESTROY 2 Heroes
  ['hero-040', SnowballAbility], // Snowball — DRAW; if Magic, may play it and DRAW
  ['hero-047', GreedyCheeksAbility], // Greedy Cheeks — each other player hands you a card
  ['hero-041', MellowDeeAbility], // Mellow Dee — DRAW; Hero may be played
  ['hero-042', LuckyBuckyAbility], // Lucky Bucky — pull; Hero may be played
  ['hero-043', FuzzyCheeksAbility], // Fuzzy Cheeks — DRAW, then play a Hero
  ['hero-044', NappingNibblesAbility], // Napping Nibbles — do nothing
  ['hero-045', TipsyTootieAbility], // Tipsy Tootie — STEAL a hero, then join that party
  ['hero-048', PeanutAbility], // Peanut — DRAW 2

  // =========================================================================
  // MONSTERS — monster-122 … monster-136
  // =========================================================================
  // Every monster passive installs on MonsterSlain and never expires: the
  // monster is in the party before that event goes out, and it never leaves.
  ['monster-122', CorruptedSabretoothAbility], // Corrupted Sabretooth — what you would DESTROY, you STEAL
  ['monster-123', MegaSlimeAbility], // Mega Slime — +1 action point each turn
  ['monster-124', AnuranCauldronAbility], // Anuran Cauldron — +1 to every roll
  ['monster-126', DracosAbility], // Dracos — may DRAW when your Hero is destroyed
  ['monster-127', BloodwingAbility], // Bloodwing — whoever challenges you DISCARDS
  ['monster-128', ArcticAriesAbility], // Arctic Aries — may DRAW after a successful roll
  ['monster-129', AbyssQueenAbility], // Abyss Queen — +1 answering a hostile Modifier
  ['monster-130', TerratugaAbility], // Terratuga — your heroes cannot be destroyed
  ['monster-131', OrthusAbility], // Orthus — DRAW a Magic card, may play it at once
  ['monster-132', RexMajorAbility], // Rex Major — drawn Modifier may DRAW again
  // Round five (2026-09-04): the last of what the mechanics were missing.
  ['hero-003', BearyWiseAbility], // Beary Wise — everyone else DISCARDS at once, one of those to your hand
  ['hero-007', QiBearAbility], // Qi Bear — DISCARD up to 3, a hero DESTROYED per card
  ['hero-013', HookAbility], // Hook — play an Item from your hand, DRAW
  ['hero-023', ShurikittyAbility], // Shurikitty — DESTROY; its gear to your hand
  ['hero-046', DodgyDealerAbility], // Dodgy Dealer — trade hands
  ['monster-125', CrownedSerpentAbility], // Crowned Serpent — anyone's Modifier, you may DRAW
  ['hero-022', SlipperyPawsAbility], // Slippery Paws — pull 2, DISCARD one of them
  ['monster-133', DarkDragonKingAbility], // Dark Dragon King — +1 to Hero-effect rolls
  ['monster-134', MalamammothAbility], // Malamammoth — DRAW an Item card, may play it at once
  ['monster-135', WarwornOwlbearAbility], // Warworn Owlbear — your Items cannot be challenged
  ['monster-136', TitanWyvernAbility], // Titan Wyvern — +1 to Challenge rolls

  // =========================================================================
  // ITEMS — item-062 … item-076
  // =========================================================================
  // Card ids are per COPY: two printed Really Big Rings are two entries.
  ['item-062', ParticularlyRustyCoinAbility], // Particularly Rusty Coin — DRAW on a failed roll
  ['item-063', ParticularlyRustyCoinAbility],
  ['item-064', ReallyBigRingAbility], // Really Big Ring — +2 to the carrier's rolls
  ['item-065', ReallyBigRingAbility],
  // Cursed: played onto an opponent's hero, and it taxes THEIR roll.
  // The six masks: no rules — the class they grant is data, read by the board.
  ['item-066', DecoyDollAbility], // Decoy Doll — takes the hit for its hero
  ['item-067', MaskAbility], // Fighter Mask
  ['item-068', MaskAbility], // Ranger Mask
  ['item-069', MaskAbility], // Thief Mask
  ['item-070', MaskAbility], // Guardian Mask
  ['item-071', MaskAbility], // Wizard Mask
  ['item-072', MaskAbility], // Bard Mask
  ['item-073', SuspiciouslyShinyCoinAbility], // Suspiciously Shiny Coin — DISCARD on a successful roll
  ['item-074', CurseOfTheSnakesEyesAbility], // Curse of the Snake's Eyes — -2 to the carrier's rolls
  ['item-075', CurseOfTheSnakesEyesAbility],
  ['item-076', SealingKeyAbility], // Sealing Key — the carrier's effect cannot be used

  // =========================================================================
  // MAGIC — magic-049 … magic-061
  // =========================================================================
  ['magic-049', DestructiveSpellAbility], // Destructive Spell — DISCARD 1, then DESTROY a hero
  ['magic-050', DestructiveSpellAbility],
  ['magic-051', EntanglingTrapAbility], // Entangling Trap — DISCARD 2, then STEAL
  ['magic-052', EntanglingTrapAbility],
  ['magic-053', CriticalBoostAbility], // Critical Boost — DRAW 3, DISCARD 1
  ['magic-054', CriticalBoostAbility],
  ['magic-055', EnchantedSpellAbility], // Enchanted Spell — +2 to all your rolls this turn
  ['magic-056', EnchantedSpellAbility],
  ['magic-057', ForcedExchangeAbility], // Forced Exchange — STEAL a hero, GIVE one back
  ['magic-058', WindsOfChangeAbility], // Winds of Change — a worn item goes home, then DRAW
  ['magic-059', WindsOfChangeAbility],
  ['magic-060', ForcefulWindsAbility], // Forceful Winds — every worn item goes home
  ['magic-061', CallToTheFallenAbility], // Call to the Fallen — a Hero card from the discard pile

  // =========================================================================
  // MODIFIERS — modifier-077 … modifier-101
  // =========================================================================
  // One declaration, 25 copies: the numbers each is printed with are card
  // data, read by ChooseValueTask at runtime.
  ...allOf(
    [
      'modifier-077',
      'modifier-078',
      'modifier-079',
      'modifier-080',
      'modifier-081',
      'modifier-082',
      'modifier-083',
      'modifier-084',
      'modifier-085',
      'modifier-086',
      'modifier-087',
      'modifier-088',
      'modifier-089',
      'modifier-090',
      'modifier-091',
      'modifier-092',
      'modifier-093',
      'modifier-094',
      'modifier-095',
      'modifier-096',
      'modifier-097',
      'modifier-098',
      'modifier-099',
      'modifier-100',
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
      'challenge-102',
      'challenge-103',
      'challenge-104',
      'challenge-105',
      'challenge-106',
      'challenge-107',
      'challenge-108',
      'challenge-109',
      'challenge-110',
      'challenge-111',
      'challenge-112',
      'challenge-113',
      'challenge-114',
      'challenge-115',
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

/**
 * Whether a leader's printed ability fires on its OWN LeaderActivated — the
 * event RollOnLeaderAction announces. That is what makes a leader ACTIVATED:
 * the Shadow Claw has such an entry, the five passives have nothing to fire,
 * so activating them would only spend the point. The action and the view
 * both read this, so the guard and the glow cannot disagree.
 */
export const isActivatable = (cardId: string): boolean =>
  (abilityRegistry.get(cardId) ?? []).some(
    (rule) =>
      rule.trigger.on === GameEventType.LeaderActivated &&
      rule.trigger.scope === TriggerScope.SelfCard,
  )

/**
 * Whether a card declares anything that still fires from a PARTY — every entry
 * but the fight-back, which only a monster still in the pile can run. Asked of
 * a leader (with `isActivatable` false, its rule is a passive by elimination)
 * and of a monster won into a party, whose printed rule is its passive. Read
 * by `views/player-view.ts` for the pink aura, so the glow and the registry
 * cannot disagree.
 */
export const hasStandingRule = (cardId: string): boolean =>
  (abilityRegistry.get(cardId) ?? []).some(
    (rule) => rule.trigger.on !== GameEventType.MonsterFoughtBack,
  )
