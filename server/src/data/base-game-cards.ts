import {
  HeroCardData,
  MonsterCardData,
  ItemCardData,
  MagicCardData,
  ModifierCardData,
  ChallengeCardData,
  PartyLeaderData,
  TurnPhase,
} from 'shared'
import { CardType, HeroClass, EffectDuration } from 'shared'

export const baseHeroes: HeroCardData[] = [
  {
    id: 'hero-001',
    name: 'Bad Axe',
    type: CardType.Hero,
    image: 'heroes/bad-axe.png',
    description: 'DESTROY a Hero card.',
    set: 'base',
    heroClass: HeroClass.Fighter,
    rollReq: 8,
    effect: { duration: EffectDuration.TurnEnd },
  },
  {
    id: 'hero-002',
    name: 'Fury Knuckle',
    type: CardType.Hero,
    image: 'heroes/fury-knuckle.png',
    description:
      "Pull a card from another player's hand. If it is a Challenge card, pull a second card from that player's hand.",
    set: 'base',
    heroClass: HeroClass.Fighter,
    rollReq: 5,
    effect: { duration: EffectDuration.TurnEnd },
  },
  {
    id: 'hero-003',
    name: 'Beary Wise',
    type: CardType.Hero,
    image: 'heroes/beary-wise.png',
    description:
      'Each other player must DISCARD a card. Choose one of the discarded cards and add it to your hand.',
    set: 'base',
    heroClass: HeroClass.Fighter,
    rollReq: 7,
    effect: { duration: EffectDuration.TurnEnd },
  },
  {
    id: 'hero-004',
    name: 'Heavy Bear',
    type: CardType.Hero,
    image: 'heroes/heavy-bear.png',
    description: 'Choose a player. That player must DISCARD 2 cards.',
    set: 'base',
    heroClass: HeroClass.Fighter,
    rollReq: 5,
    effect: { duration: EffectDuration.TurnEnd },
  },
  {
    id: 'hero-005',
    name: 'Bear Claw',
    type: CardType.Hero,
    image: 'heroes/bear-claw.png',
    description:
      "Pull a card from another player's hand. If it is a Hero card, pull a second card from that player's hand.",
    set: 'base',
    heroClass: HeroClass.Fighter,
    rollReq: 7,
    effect: { duration: EffectDuration.TurnEnd },
  },
  {
    id: 'hero-006',
    name: 'Tough Teddy',
    type: CardType.Hero,
    image: 'heroes/tough-teddy.png',
    description:
      'Each other player with a Fighter in their Party must DISCARD a card.',
    set: 'base',
    heroClass: HeroClass.Fighter,
    rollReq: 4,
    effect: { duration: EffectDuration.TurnEnd },
  },
  {
    id: 'hero-007',
    name: 'Qi Bear',
    type: CardType.Hero,
    image: 'heroes/qi-bear.png',
    description:
      'DISCARD up to 3 cards. For each card discarded, DESTROY a Hero card.',
    set: 'base',
    heroClass: HeroClass.Fighter,
    rollReq: 10,
    effect: { duration: EffectDuration.TurnEnd },
  },
  {
    id: 'hero-008',
    name: 'Pan Chucks',
    type: CardType.Hero,
    image: 'heroes/pan-chucks.png',
    description:
      'DRAW 2 cards. If at least one of those cards is a Challenge card, you may reveal it, then DESTROY a Hero card.',
    set: 'base',
    heroClass: HeroClass.Fighter,
    rollReq: 8,
    effect: { duration: EffectDuration.TurnEnd },
  },
  {
    id: 'hero-009',
    name: 'Serious Grey',
    type: CardType.Hero,
    image: 'heroes/serious-grey.png',
    description: 'DESTROY a Hero and DRAW a card.',
    set: 'base',
    heroClass: HeroClass.Ranger,
    rollReq: 9,
    effect: { duration: EffectDuration.TurnEnd },
  },
  {
    id: 'hero-010',
    name: 'Quick Draw',
    type: CardType.Hero,
    image: 'heroes/quick-draw.png',
    description:
      'DRAW 2 cards. If at least one of those cards is an Item card, you may play one of them immediately.',
    set: 'base',
    heroClass: HeroClass.Ranger,
    rollReq: 8,
    effect: { duration: EffectDuration.TurnEnd },
  },
  {
    id: 'hero-011',
    name: 'Lookie Rookie',
    type: CardType.Hero,
    image: 'heroes/lookie-rookie.png',
    description:
      'Search the discard pile for an Item card and add it to your hand.',
    set: 'base',
    heroClass: HeroClass.Ranger,
    rollReq: 5,
    effect: { duration: EffectDuration.TurnEnd },
  },
  {
    id: 'hero-012',
    name: 'Wildshot',
    type: CardType.Hero,
    image: 'heroes/wildshot.png',
    description: 'DRAW 3 cards and DISCARD a card.',
    set: 'base',
    heroClass: HeroClass.Ranger,
    rollReq: 8,
    effect: { duration: EffectDuration.TurnEnd },
  },
  {
    id: 'hero-013',
    name: 'Hook',
    type: CardType.Hero,
    image: 'heroes/hook.png',
    description:
      'Play an Item card from your hand immediately and DRAW a card.',
    set: 'base',
    heroClass: HeroClass.Ranger,
    rollReq: 6,
    effect: { duration: EffectDuration.TurnEnd },
  },
  {
    id: 'hero-014',
    name: 'Bullseye',
    type: CardType.Hero,
    image: 'heroes/bullseye.png',
    description:
      'Look at the top 3 cards of the deck. Add one to your hand, then return the other two to the top of the deck in any order.',
    set: 'base',
    heroClass: HeroClass.Ranger,
    rollReq: 7,
    effect: { duration: EffectDuration.TurnEnd },
  },
  {
    id: 'hero-015',
    name: 'Wily Red',
    type: CardType.Hero,
    image: 'heroes/wily-red.png',
    description: 'DRAW cards until you have 7 cards in your hand.',
    set: 'base',
    heroClass: HeroClass.Ranger,
    rollReq: 10,
    effect: { duration: EffectDuration.TurnEnd },
  },
  {
    id: 'hero-016',
    name: 'Sharp Fox',
    type: CardType.Hero,
    image: 'heroes/sharp-fox.png',
    description: "Look at another player's hand.",
    set: 'base',
    heroClass: HeroClass.Ranger,
    rollReq: 5,
    effect: { duration: EffectDuration.TurnEnd },
  },
]
// add more heroes...

export const baseMonsters: MonsterCardData[] = [
  {
    id: 'monster-128',
    name: 'Arctic Aries',
    type: CardType.Monster,
    image: 'monsters/arctic-aries.png',
    description:
      "Each time you successfully roll to use a Hero card's effect, you may DRAW a card.",
    set: 'base',
    partyReq: { classes: ['Any'] },
    rollWinReq: 10,
    rollLoseReq: 6,
    skill: {
      condition: 'When face up',
      description: 'All rolls -1',
    },
  },
  {
    id: 'monster-129',
    name: 'Abyss Queen',
    type: CardType.Monster,
    image: 'monsters/abyss-queen.png',
    description:
      'Each time another player plays a Modifier card on one of your rolls, +1 to your roll.',
    set: 'base',
    partyReq: { classes: ['Any', 'Any'] },
    rollWinReq: 8,
    rollLoseReq: 5,
    skill: {
      condition: 'When face up',
      description: 'All rolls -1',
    },
  },
  {
    id: 'monster-130',
    name: 'Terratuga',
    type: CardType.Monster,
    image: 'monsters/terratuga.png',
    description: 'Your Hero cards cannot be destroyed.',
    set: 'base',
    partyReq: { classes: ['Any'] },
    rollWinReq: 11,
    rollLoseReq: 7,
    skill: {
      condition: 'When face up',
      description: 'All rolls -1',
    },
  },
  {
    id: 'monster-131',
    name: 'Orthus',
    type: CardType.Monster,
    image: 'monsters/orthus.png',
    description:
      'Each time you DRAW a Magic card, you may play it immediately.',
    set: 'base',
    partyReq: { classes: [HeroClass.Wizard, 'Any'] },
    rollWinReq: 8,
    rollLoseReq: 4,
    skill: {
      condition: 'When face up',
      description: 'All rolls -1',
    },
  },
  {
    id: 'monster-132',
    name: 'Rex Major',
    type: CardType.Monster,
    image: 'monsters/rex-major.png',
    description:
      'Each time you DRAW a Modifier card, you may reveal it and DRAW a second card.',
    set: 'base',
    partyReq: { classes: [HeroClass.Guardian, 'Any'] },
    rollWinReq: 8,
    rollLoseReq: 4,
    skill: {
      condition: 'When face up',
      description: 'All rolls -1',
    },
  },
  {
    id: 'monster-133',
    name: 'Dark Dragon King',
    type: CardType.Monster,
    image: 'monsters/dark-dragon-king.png',
    description:
      "Each time you roll for a Hero card's effect, +1 to your roll.",
    set: 'base',
    partyReq: { classes: [HeroClass.Bard, 'Any'] },
    rollWinReq: 8,
    rollLoseReq: 4,
    skill: {
      condition: 'When face up',
      description: 'All rolls -1',
    },
  },

  // add more monsters...
]

export const baseItems: ItemCardData[] = [
  {
    id: 'item-057',
    name: 'Really Big Ring',
    type: CardType.Item,
    image: 'items/really-big-ring.png',
    description:
      "Each time you roll to use the equipped Hero card's effect, +2 to your roll.",
    set: 'base',
    effect: { duration: EffectDuration.TurnEnd },
    equippedHero: undefined,
    cursed: false,
  },
  {
    id: 'item-058',
    name: 'Decoy Doll',
    type: CardType.Item,
    image: 'items/decoy-doll.png',
    description:
      'If the equipped Hero card would be sacrificed or destroyed, move Decoy Doll to the discard pile instead.',
    set: 'base',
    effect: { duration: EffectDuration.TurnEnd },
    equippedHero: undefined,
    cursed: false,
  },
  {
    id: 'item-059',
    name: 'Fighter Mask',
    type: CardType.Item,
    image: 'items/fighter-mask.png',
    description:
      'The equipped Hero card is considered a Fighter instead of its original class.',
    set: 'base',
    effect: { duration: EffectDuration.TurnEnd },
    equippedHero: undefined,
    cursed: false,
  },
  {
    id: 'item-060',
    name: 'Ranger Mask',
    type: CardType.Item,
    image: 'items/ranger-mask.png',
    description:
      'The equipped Hero card is considered a Ranger instead of its original class.',
    set: 'base',
    effect: { duration: EffectDuration.TurnEnd },
    equippedHero: undefined,
    cursed: false,
  },
  {
    id: 'item-061',
    name: 'Thief Mask',
    type: CardType.Item,
    image: 'items/thief-mask.png',
    description:
      'The equipped Hero card is considered a Thief instead of its original class.',
    set: 'base',
    effect: { duration: EffectDuration.TurnEnd },
    equippedHero: undefined,
    cursed: false,
  },
  {
    id: 'item-062',
    name: 'Guardian Mask',
    type: CardType.Item,
    image: 'items/guardian-mask.png',
    description:
      'The equipped Hero card is considered a Guardian instead of its original class.',
    set: 'base',
    effect: { duration: EffectDuration.TurnEnd },
    equippedHero: undefined,
    cursed: false,
  },
  {
    id: 'item-063',
    name: 'Wizard Mask',
    type: CardType.Item,
    image: 'items/wizard-mask.png',
    description:
      'The equipped Hero card is considered a Wizard instead of its original class.',
    set: 'base',
    effect: { duration: EffectDuration.TurnEnd },
    equippedHero: undefined,
    cursed: false,
  },
  {
    id: 'item-064',
    name: 'Bard Mask',
    type: CardType.Item,
    image: 'items/bard-mask.png',
    description:
      'The equipped Hero card is considered a Bard instead of its original class.',
    set: 'base',
    effect: { duration: EffectDuration.TurnEnd },
    equippedHero: undefined,
    cursed: false,
  },

  {
    id: 'item-065',
    name: 'Suspiciously Shiny Coin',
    type: CardType.Item,
    image: 'items/suspiciously-shiny-coin.png',
    description:
      "If you successfully roll to use the equipped Hero card's effect, DISCARD a card.",
    set: 'base',
    effect: { duration: EffectDuration.TurnEnd },
    equippedHero: undefined,
    cursed: true,
  },
  {
    id: 'item-066',
    name: "Curse of the Snake's Eyes",
    type: CardType.Item,
    image: 'items/curse-of-the-snakes-eyes.png',
    description:
      "Each time you roll to use the equipped Hero card's effect, -2 to your roll.",
    set: 'base',
    effect: { duration: EffectDuration.TurnEnd },
    equippedHero: undefined,
    cursed: true,
  },
  {
    id: 'item-067',
    name: "Curse of the Snake's Eyes",
    type: CardType.Item,
    image: 'items/curse-of-the-snakes-eyes.png',
    description:
      "Each time you roll to use the equipped Hero card's effect, -2 to your roll.",
    set: 'base',
    effect: { duration: EffectDuration.TurnEnd },
    equippedHero: undefined,
    cursed: true,
  },
  {
    id: 'item-068',
    name: 'Sealing Key',
    type: CardType.Item,
    image: 'items/sealing-key.png',
    description: "You cannot use the equipped Hero card's effect.",
    set: 'base',
    effect: { duration: EffectDuration.TurnEnd },
    equippedHero: undefined,
    cursed: true,
  },

  // add items...
]

export const baseMagic: MagicCardData[] = [
  {
    id: 'magic-043',
    name: 'Destructive Spell',
    type: CardType.Magic,
    image: 'magic/destructive-spell.png',
    description: 'DISCARD a card, then DESTROY a Hero card.',
    set: 'base',
    effect: {
      duration: EffectDuration.TurnEnd,
    },
  },
  {
    id: 'magic-044',
    name: 'Destructive Spell',
    type: CardType.Magic,
    image: 'magic/destructive-spell.png',
    description: 'DISCARD a card, then DESTROY a Hero card.',
    set: 'base',
    effect: {
      duration: EffectDuration.TurnEnd,
    },
  },
  {
    id: 'magic-045',
    name: 'Entangling Trap',
    type: CardType.Magic,
    image: 'magic/entangling-trap.png',
    description: 'DISCARD 2 cards, then STEAL a Hero card.',
    set: 'base',
    effect: {
      duration: EffectDuration.TurnEnd,
    },
  },
  {
    id: 'magic-046',
    name: 'Entangling Trap',
    type: CardType.Magic,
    image: 'magic/entangling-trap.png',
    description: 'DISCARD 2 cards, then STEAL a Hero card.',
    set: 'base',
    effect: {
      duration: EffectDuration.TurnEnd,
    },
  },
  {
    id: 'magic-047',
    name: 'Critical Boost',
    type: CardType.Magic,
    image: 'magic/critical-boost.png',
    description: 'DRAW 3 cards and DISCARD a card.',
    set: 'base',
    effect: {
      duration: EffectDuration.TurnEnd,
    },
  },
  {
    id: 'magic-048',
    name: 'Critical Boost',
    type: CardType.Magic,
    image: 'magic/critical-boost.png',
    description: 'DRAW 3 cards and DISCARD a card.',
    set: 'base',
    effect: {
      duration: EffectDuration.TurnEnd,
    },
  },
  {
    id: 'magic-049',
    name: 'Enchanted Spell',
    type: CardType.Magic,
    image: 'magic/enchanted-spell.png',
    description: '+2 to all of your rolls until the end of your turn.',
    set: 'base',
    effect: {
      duration: EffectDuration.TurnEnd,
    },
  },
  {
    id: 'magic-050',
    name: 'Enchanted Spell',
    type: CardType.Magic,
    image: 'magic/enchanted-spell.png',
    description: '+2 to all of your rolls until the end of your turn.',
    set: 'base',
    effect: {
      duration: EffectDuration.TurnEnd,
    },
  },

  // add magic cards...
]

export const baseModifiers: ModifierCardData[] = [
  {
    id: 'modifier-069',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier.png',
    description:
      'Play this card after any player (including you) rolls the dice. +2 or -2 to that roll.',
    set: 'base',
    values: [2, -2],
  },
  {
    id: 'modifier-070',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier.png',
    description:
      'Play this card after any player (including you) rolls the dice. +2 or -2 to that roll.',
    set: 'base',
    values: [2, -2],
  },
  {
    id: 'modifier-071',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier.png',
    description:
      'Play this card after any player (including you) rolls the dice. +2 or -2 to that roll.',
    set: 'base',
    values: [2, -2],
  },
  {
    id: 'modifier-072',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier.png',
    description:
      'Play this card after any player (including you) rolls the dice. +2 or -2 to that roll.',
    set: 'base',
    values: [2, -2],
  },
  {
    id: 'modifier-097',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier-plus-4.png',
    description:
      'Play this card after any player (including you) rolls the dice. +4 to that roll.',
    set: 'base',
    values: [4],
  },
  {
    id: 'modifier-098',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier-minus-4.png',
    description:
      'Play this card after any player (including you) rolls the dice. -4 to that roll.',
    set: 'base',
    values: [-4],
  },
  {
    id: 'modifier-099',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier-minus-4.png',
    description:
      'Play this card after any player (including you) rolls the dice. -4 to that roll.',
    set: 'base',
    values: [-4],
  },
  {
    id: 'modifier-100',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier-minus-4.png',
    description:
      'Play this card after any player (including you) rolls the dice. -4 to that roll.',
    set: 'base',
    values: [-4],
  },
  {
    id: 'modifier-101',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier-minus-4.png',
    description:
      'Play this card after any player (including you) rolls the dice. -4 to that roll.',
    set: 'base',
    values: [-4],
  },

  // add modifiers...
]

export const baseChallenges: ChallengeCardData[] = [
  {
    id: 'challenge-102',
    name: 'Challenge',
    type: CardType.Challenge,
    image: 'challenges/challenge.png',
    description:
      'You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card.',
    set: 'base',
  },
  {
    id: 'challenge-103',
    name: 'Challenge',
    type: CardType.Challenge,
    image: 'challenges/challenge.png',
    description:
      'You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card.',
    set: 'base',
  },
  {
    id: 'challenge-104',
    name: 'Challenge',
    type: CardType.Challenge,
    image: 'challenges/challenge.png',
    description:
      'You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card.',
    set: 'base',
  },
  // add challenges...
]

export const baseLeaders: PartyLeaderData[] = [
  {
    id: 'leader-115',
    name: 'The Divine Arrow',
    type: CardType.Leader,
    image: 'leaders/the-divine-arrow.png',
    description:
      'Each time you roll to ATTACK a Monster card, +1 to your roll.',
    set: 'base',
    heroClass: HeroClass.Ranger,
    skill: {},
  },
  {
    id: 'leader-116',
    name: 'The Shadow Claw',
    type: CardType.Leader,
    image: 'leaders/the-shadow-claw.png',
    description:
      "Once per turn on your turn, you may spend an action point to pull a card from another player's hand.",
    set: 'base',
    heroClass: HeroClass.Thief,
    skill: {},
  },
  {
    id: 'leader-117',
    name: 'The Fist of Reason',
    type: CardType.Leader,
    image: 'leaders/the-fist-of-reason.png',
    description: 'Each time you roll to CHALLENGE, +2 to your roll.',
    set: 'base',
    heroClass: HeroClass.Fighter,
    skill: {},
  },
  {
    id: 'leader-118',
    name: 'The Charismatic Song',
    type: CardType.Leader,
    image: 'leaders/the-charismatic-song.png',
    description:
      "Each time you roll to use a Hero card's effect, +1 to your roll.",
    set: 'base',
    heroClass: HeroClass.Bard,
    skill: {},
  },
  {
    id: 'leader-119',
    name: 'The Cloaked Sage',
    type: CardType.Leader,
    image: 'leaders/the-cloaked-sage.png',
    description: 'Each time you play a Magic card, DRAW a card.',
    set: 'base',
    heroClass: HeroClass.Wizard,
    skill: {},
  },
  {
    id: 'leader-120',
    name: 'The Protecting Horn',
    type: CardType.Leader,
    image: 'leaders/the-protecting-horn.png',
    description:
      'Each time you play a Modifier card on a roll, +1 or -1 to that roll.',
    set: 'base',
    heroClass: HeroClass.Guardian,
    skill: {},
  },

  // add more leaders...
]

export const baseGameCards = [
  ...baseHeroes,
  ...baseMonsters,
  ...baseItems,
  ...baseMagic,
  ...baseModifiers,
  ...baseChallenges,
  ...baseLeaders,
]
