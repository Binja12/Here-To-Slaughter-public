import {
  HeroCardData,
  MonsterCardData,
  ItemCardData,
  MagicCardData,
  ModifierCardData,
  ChallengeCardData,
  PartyLeaderData,
  RollCompareMode,
} from 'shared'
import { CardType, HeroClass } from 'shared'

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
  },
  {
    id: 'hero-017',
    name: 'Kit Napper',
    type: CardType.Hero,
    image: 'heroes/kit-napper.png',
    description: 'STEAL a Hero card.',
    set: 'base',
    heroClass: HeroClass.Thief,
    rollReq: 9,
  },
  {
    id: 'hero-018',
    name: 'Sly Pickings',
    type: CardType.Hero,
    image: 'heroes/sly-pickings.png',
    description:
      "Pull a card from another player's hand. If that card is an Item card, you may play it immediately.",
    set: 'base',
    heroClass: HeroClass.Thief,
    rollReq: 6,
  },
  {
    id: 'hero-019',
    name: 'Meowzio',
    type: CardType.Hero,
    image: 'heroes/meowzio.png',
    description:
      "Choose a player. STEAL a Hero from that player and pull a card from that player's hand.",
    set: 'base',
    heroClass: HeroClass.Thief,
    rollReq: 10,
  },
  {
    id: 'hero-020',
    name: 'Plundering Puma',
    type: CardType.Hero,
    image: 'heroes/plundering-puma.png',
    description:
      "Pull 2 cards from another player's hand. That player may DRAW a card.",
    set: 'base',
    heroClass: HeroClass.Thief,
    rollReq: 6,
  },
  {
    id: 'hero-021',
    name: 'Silent Shadow',
    type: CardType.Hero,
    image: 'heroes/silent-shadow.png',
    description:
      "Look at another player's hand. Choose a card and add it to your hand.",
    set: 'base',
    heroClass: HeroClass.Thief,
    rollReq: 8,
  },
  {
    id: 'hero-022',
    name: 'Slippery Paws',
    type: CardType.Hero,
    image: 'heroes/slippery-paws.png',
    description:
      "Pull 2 cards from another player's hand, then DISCARD one of those cards.",
    set: 'base',
    heroClass: HeroClass.Thief,
    rollReq: 6,
  },
  {
    id: 'hero-023',
    name: 'Shurikitty',
    type: CardType.Hero,
    image: 'heroes/shurikitty.png',
    description:
      'DESTROY a Hero card. If that Hero card had an Item card equipped to it, add that Item card to your hand instead of moving it to the discard pile.',
    set: 'base',
    heroClass: HeroClass.Thief,
    rollReq: 9,
  },
  {
    id: 'hero-024',
    name: 'Smooth Mimimeow',
    type: CardType.Hero,
    image: 'heroes/smooth-mimimeow.png',
    description:
      'Pull a card from the hand of each other player with a Thief in their Party.',
    set: 'base',
    heroClass: HeroClass.Thief,
    rollReq: 7,
  },
  {
    id: 'hero-025',
    name: 'Guiding Light',
    type: CardType.Hero,
    image: 'heroes/guiding-light.png',
    description:
      'Search the discard pile for a Hero card and add it to your hand.',
    set: 'base',
    heroClass: HeroClass.Guardian,
    rollReq: 7,
  },
  {
    id: 'hero-026',
    name: 'Holy Curselifter',
    type: CardType.Hero,
    image: 'heroes/holy-curselifter.png',
    description:
      'Return a Cursed Item card equipped to a Hero card in your Party to your hand.',
    set: 'base',
    heroClass: HeroClass.Guardian,
    rollReq: 5,
  },
  {
    id: 'hero-027',
    name: 'Radiant Horn',
    type: CardType.Hero,
    image: 'heroes/radiant-horn.png',
    description:
      'Search the discard pile for a Modifier card and add it to your hand.',
    set: 'base',
    heroClass: HeroClass.Guardian,
    rollReq: 6,
  },
  {
    id: 'hero-028',
    name: 'Wise Shield',
    type: CardType.Hero,
    image: 'heroes/wise-shield.png',
    description: '+3 to all of your rolls until the end of your turn.',
    set: 'base',
    heroClass: HeroClass.Guardian,
    rollReq: 6,
  },
  {
    id: 'hero-029',
    name: 'Vibrant Glow',
    type: CardType.Hero,
    image: 'heroes/vibrant-glow.png',
    description: '+5 to all of your rolls until the end of your turn.',
    set: 'base',
    heroClass: HeroClass.Guardian,
    rollReq: 9,
  },
  {
    id: 'hero-030',
    name: 'Iron Resolve',
    type: CardType.Hero,
    image: 'heroes/iron-resolve.png',
    description:
      'Cards you play cannot be challenged for the rest of your turn.',
    set: 'base',
    heroClass: HeroClass.Guardian,
    rollReq: 8,
  },
  {
    id: 'hero-031',
    name: 'Mighty Blade',
    type: CardType.Hero,
    image: 'heroes/mighty-blade.png',
    description:
      'Hero cards in your Party cannot be destroyed until your next turn.',
    set: 'base',
    heroClass: HeroClass.Guardian,
    rollReq: 8,
  },
  {
    id: 'hero-032',
    name: 'Calming Voice',
    type: CardType.Hero,
    image: 'heroes/calming-voice.png',
    description:
      'Hero cards in your Party cannot be stolen until your next turn.',
    set: 'base',
    heroClass: HeroClass.Guardian,
    rollReq: 9,
  },
  {
    id: 'hero-033',
    name: 'Hopper',
    type: CardType.Hero,
    image: 'heroes/hopper.png',
    description: 'Choose a player. That player must SACRIFICE a Hero card.',
    set: 'base',
    heroClass: HeroClass.Wizard,
    rollReq: 7,
  },
  {
    id: 'hero-034',
    name: 'Buttons',
    type: CardType.Hero,
    image: 'heroes/buttons.png',
    description:
      "Pull a card from another player's hand. If it is a Magic card, you may play it immediately.",
    set: 'base',
    heroClass: HeroClass.Wizard,
    rollReq: 6,
  },
  {
    id: 'hero-035',
    name: 'Spooky',
    type: CardType.Hero,
    image: 'heroes/spooky.png',
    description: 'Each other player must SACRIFICE a Hero card.',
    set: 'base',
    heroClass: HeroClass.Wizard,
    rollReq: 10,
  },
  {
    id: 'hero-036',
    name: 'Wiggles',
    type: CardType.Hero,
    image: 'heroes/wiggles.png',
    description: 'STEAL a Hero card and roll to use its effect immediately.',
    set: 'base',
    heroClass: HeroClass.Wizard,
    rollReq: 10,
  },
  {
    id: 'hero-037',
    name: 'Whiskers',
    type: CardType.Hero,
    image: 'heroes/whiskers.png',
    description: 'STEAL a Hero card and DESTROY a Hero card.',
    set: 'base',
    heroClass: HeroClass.Wizard,
    rollReq: 11,
  },
  {
    id: 'hero-038',
    name: 'Fluffy',
    type: CardType.Hero,
    image: 'heroes/fluffy.png',
    description: 'DESTROY 2 Hero cards.',
    set: 'base',
    heroClass: HeroClass.Wizard,
    rollReq: 10,
  },
  {
    id: 'hero-039',
    name: 'Bun Bun',
    type: CardType.Hero,
    image: 'heroes/bun-bun.png',
    description:
      'Search the discard pile for a Magic card and add it to your hand.',
    set: 'base',
    heroClass: HeroClass.Wizard,
    rollReq: 5,
  },
  {
    id: 'hero-040',
    name: 'Snowball',
    type: CardType.Hero,
    image: 'heroes/snowball.png',
    description:
      'DRAW a card. If it is a Magic card, you may play it immediately and DRAW a second card.',
    set: 'base',
    heroClass: HeroClass.Wizard,
    rollReq: 6,
  },
  {
    id: 'hero-041',
    name: 'Mellow Dee',
    type: CardType.Hero,
    image: 'heroes/mellow-dee.png',
    description:
      'DRAW a card. If that card is a Hero card, you may play it immediately.',
    set: 'base',
    heroClass: HeroClass.Bard,
    rollReq: 7,
  },
  {
    id: 'hero-042',
    name: 'Lucky Bucky',
    type: CardType.Hero,
    image: 'heroes/lucky-bucky.png',
    description:
      "Pull a card from another player's hand. If that card is a Hero card, you may play it immediately.",
    set: 'base',
    heroClass: HeroClass.Bard,
    rollReq: 7,
  },
  {
    id: 'hero-043',
    name: 'Fuzzy Cheeks',
    type: CardType.Hero,
    image: 'heroes/fuzzy-cheeks.png',
    description: 'DRAW a card and play a Hero card from your hand immediately.',
    set: 'base',
    heroClass: HeroClass.Bard,
    rollReq: 8,
  },
  {
    id: 'hero-044',
    name: 'Napping Nibbles',
    type: CardType.Hero,
    image: 'heroes/napping-nibbles.png',
    description: 'Do nothing.',
    set: 'base',
    heroClass: HeroClass.Bard,
    rollReq: 2,
  },
  {
    id: 'hero-045',
    name: 'Tipsy Tootie',
    type: CardType.Hero,
    image: 'heroes/tipsy-tootie.png',
    description:
      "Choose a player. STEAL a Hero card from that player's Party and move Tipsy Tootie to that player's Party.",
    set: 'base',
    heroClass: HeroClass.Bard,
    rollReq: 6,
  },
  {
    id: 'hero-046',
    name: 'Dodgy Dealer',
    type: CardType.Hero,
    image: 'heroes/dodgy-dealer.png',
    description: 'Trade hands with another player.',
    set: 'base',
    heroClass: HeroClass.Bard,
    rollReq: 9,
  },
  {
    id: 'hero-047',
    name: 'Greedy Cheeks',
    type: CardType.Hero,
    image: 'heroes/greedy-cheeks.png',
    description: 'Each other player must give you a card from their hand.',
    set: 'base',
    heroClass: HeroClass.Bard,
    rollReq: 8,
  },
  {
    id: 'hero-048',
    name: 'Peanut',
    type: CardType.Hero,
    image: 'heroes/peanut.png',
    description: 'DRAW 2 cards.',
    set: 'base',
    heroClass: HeroClass.Bard,
    rollReq: 7,
  },
]
// add more heroes...

export const baseMonsters: MonsterCardData[] = [
  {
    id: 'monster-122',
    name: 'Corrupted Sabretooth',
    type: CardType.Monster,
    image: 'monsters/corrupted-sabretooth.png',
    description:
      'Each time you would DESTROY a Hero card, you may STEAL that Hero card instead.',
    set: 'base',
    partyReq: { classes: ['Any', 'Any', 'Any'] },
    higherReq: 9,
    lowerReq: 6,
    rollCompareMode: RollCompareMode.HighToWin,
    slay: 'SLAY this Monster card and DRAW a card.',
    fightBack: {
      description: 'SACRIFICE a Hero card.',
    },
  },
  {
    id: 'monster-123',
    name: 'Mega Slime',
    type: CardType.Monster,
    image: 'monsters/mega-slime.png',
    description: 'You may spend an extra action point on each of your turns.',
    set: 'base',
    partyReq: { classes: ['Any', 'Any', 'Any', 'Any'] },
    higherReq: 8,
    lowerReq: 7,
    rollCompareMode: RollCompareMode.HighToWin,
    slay: 'SLAY this Monster card and DRAW 2 cards.',
    fightBack: {
      description: 'SACRIFICE a Hero card.',
    },
  },
  {
    id: 'monster-124',
    name: 'Anuran Cauldron',
    type: CardType.Monster,
    image: 'monsters/anuran-cauldron.png',
    description: 'Each time you roll, +1 to your roll.',
    set: 'base',
    partyReq: { classes: ['Any', 'Any', 'Any'] },
    higherReq: 7,
    lowerReq: 6,
    rollCompareMode: RollCompareMode.HighToWin,
    slay: 'SLAY this Monster card.',
    fightBack: {
      description: 'SACRIFICE a Hero card.',
    },
  },
  {
    id: 'monster-125',
    name: 'Crowned Serpent',
    type: CardType.Monster,
    image: 'monsters/crowned-serpent.png',
    description:
      'Each time any player (including you) plays a Modifier card, you may DRAW a card.',
    set: 'base',
    partyReq: { classes: ['Any', 'Any'] },
    higherReq: 10,
    lowerReq: 7,
    rollCompareMode: RollCompareMode.HighToWin,
    slay: 'SLAY this Monster card.',
    fightBack: {
      description: 'SACRIFICE a Hero card.',
    },
  },
  {
    id: 'monster-126',
    name: 'Dracos',
    type: CardType.Monster,
    image: 'monsters/dracos.png',
    description:
      'Each time a Hero card in your Party is destroyed, you may DRAW a card.',
    set: 'base',
    partyReq: { classes: ['Any'] },
    higherReq: 5,
    lowerReq: 8,
    rollCompareMode: RollCompareMode.HighToWin,
    slay: 'SLAY this Monster card.',
    fightBack: {
      description: 'SACRIFICE a Hero card.',
    },
  },
  {
    id: 'monster-127',
    name: 'Bloodwing',
    type: CardType.Monster,
    image: 'monsters/bloodwing.png',
    description:
      'Each time another player CHALLENGES you, that player must DISCARD a card.',
    set: 'base',
    partyReq: { classes: ['Any', 'Any'] },
    higherReq: 9,
    lowerReq: 6,
    rollCompareMode: RollCompareMode.HighToWin,
    slay: 'SLAY this Monster card.',
    fightBack: {
      description: 'SACRIFICE a Hero card.',
    },
  },
  {
    id: 'monster-128',
    name: 'Arctic Aries',
    type: CardType.Monster,
    image: 'monsters/arctic-aries.png',
    description:
      "Each time you successfully roll to use a Hero card's effect, you may DRAW a card.",
    set: 'base',
    partyReq: { classes: ['Any'] },
    higherReq: 10,
    lowerReq: 6,
    rollCompareMode: RollCompareMode.HighToWin,
    slay: 'SLAY this Monster card.',
    fightBack: {
      description: 'SACRIFICE a Hero card.',
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
    higherReq: 8,
    lowerReq: 5,
    rollCompareMode: RollCompareMode.HighToWin,
    slay: 'SLAY this Monster card.',
    fightBack: {
      description: 'SACRIFICE a Hero card.',
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
    higherReq: 11,
    lowerReq: 7,
    rollCompareMode: RollCompareMode.HighToWin,
    slay: 'SLAY this Monster card.',
    fightBack: {
      description: 'SACRIFICE a Hero card.',
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
    higherReq: 8,
    lowerReq: 4,
    rollCompareMode: RollCompareMode.HighToWin,
    slay: 'SLAY this Monster card.',
    fightBack: {
      description: 'DISCARD 2 cards.',
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
    higherReq: 8,
    lowerReq: 4,
    rollCompareMode: RollCompareMode.HighToWin,
    slay: 'SLAY this Monster card.',
    fightBack: {
      description: 'DISCARD 2 cards.',
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
    higherReq: 8,
    lowerReq: 4,
    rollCompareMode: RollCompareMode.HighToWin,
    slay: 'SLAY this Monster card.',
    fightBack: {
      description: 'DISCARD 2 cards.',
    },
  },
  {
    id: 'monster-134',
    name: 'Malamammoth',
    type: CardType.Monster,
    image: 'monsters/malamammoth.png',
    description:
      'Each time you DRAW an Item card, you may play it immediately.',
    set: 'base',
    partyReq: { classes: [HeroClass.Ranger, 'Any'] },
    higherReq: 8,
    lowerReq: 4,
    rollCompareMode: RollCompareMode.HighToWin,
    slay: 'SLAY this Monster card.',
    fightBack: {
      description: 'DISCARD 2 cards.',
    },
  },
  {
    id: 'monster-135',
    name: 'Warworn Owlbear',
    type: CardType.Monster,
    image: 'monsters/warworn-owlbear.png',
    description: 'Item cards you play cannot be challenged.',
    set: 'base',
    partyReq: { classes: [HeroClass.Thief, 'Any'] },
    higherReq: 8,
    lowerReq: 4,
    rollCompareMode: RollCompareMode.HighToWin,
    slay: 'SLAY this Monster card.',
    fightBack: {
      description: 'DISCARD 2 cards.',
    },
  },
  {
    id: 'monster-136',
    name: 'Titan Wyvern',
    type: CardType.Monster,
    image: 'monsters/titan-wyvern.png',
    description: 'Each time you roll for a Challenge card, +1 to your roll.',
    set: 'base',
    partyReq: { classes: [HeroClass.Thief, 'Any'] },
    higherReq: 8,
    lowerReq: 4,
    rollCompareMode: RollCompareMode.HighToWin,
    slay: 'SLAY this Monster card.',
    fightBack: {
      description: 'DISCARD 2 cards.',
    },
  },
]

export const baseItems: ItemCardData[] = [
  {
    id: 'item-062',
    name: 'Particularly Rusty Coin',
    type: CardType.Item,
    image: 'items/particularly-rusty-coin.png',
    description:
      "If you unsuccessfully roll to use the equipped Hero card's effect, DRAW a card.",
    set: 'base',

    cursed: false,
  },
  {
    id: 'item-063',
    name: 'Particularly Rusty Coin',
    type: CardType.Item,
    image: 'items/particularly-rusty-coin.png',
    description:
      "If you unsuccessfully roll to use the equipped Hero card's effect, DRAW a card.",
    set: 'base',

    cursed: false,
  },
  {
    id: 'item-064',
    name: 'Really Big Ring',
    type: CardType.Item,
    image: 'items/really-big-ring.png',
    description:
      "Each time you roll to use the equipped Hero card's effect, +2 to your roll.",
    set: 'base',

    cursed: false,
  },
  {
    id: 'item-065',
    name: 'Really Big Ring',
    type: CardType.Item,
    image: 'items/really-big-ring.png',
    description:
      "Each time you roll to use the equipped Hero card's effect, +2 to your roll.",
    set: 'base',

    cursed: false,
  },
  {
    id: 'item-066',
    name: 'Decoy Doll',
    type: CardType.Item,
    image: 'items/decoy-doll.png',
    description:
      'If the equipped Hero card would be sacrificed or destroyed, move Decoy Doll to the discard pile instead.',
    set: 'base',

    cursed: false,
  },
  {
    id: 'item-067',
    name: 'Fighter Mask',
    type: CardType.Item,
    image: 'items/fighter-mask.png',
    description:
      'The equipped Hero card is considered a Fighter instead of its original class.',
    set: 'base',

    cursed: false,
    heroClass: HeroClass.Fighter,
  },
  {
    id: 'item-068',
    name: 'Ranger Mask',
    type: CardType.Item,
    image: 'items/ranger-mask.png',
    description:
      'The equipped Hero card is considered a Ranger instead of its original class.',
    set: 'base',

    cursed: false,
    heroClass: HeroClass.Ranger,
  },
  {
    id: 'item-069',
    name: 'Thief Mask',
    type: CardType.Item,
    image: 'items/thief-mask.png',
    description:
      'The equipped Hero card is considered a Thief instead of its original class.',
    set: 'base',

    cursed: false,
    heroClass: HeroClass.Thief,
  },
  {
    id: 'item-070',
    name: 'Guardian Mask',
    type: CardType.Item,
    image: 'items/guardian-mask.png',
    description:
      'The equipped Hero card is considered a Guardian instead of its original class.',
    set: 'base',

    cursed: false,
    heroClass: HeroClass.Guardian,
  },
  {
    id: 'item-071',
    name: 'Wizard Mask',
    type: CardType.Item,
    image: 'items/wizard-mask.png',
    description:
      'The equipped Hero card is considered a Wizard instead of its original class.',
    set: 'base',

    cursed: false,
    heroClass: HeroClass.Wizard,
  },
  {
    id: 'item-072',
    name: 'Bard Mask',
    type: CardType.Item,
    image: 'items/bard-mask.png',
    description:
      'The equipped Hero card is considered a Bard instead of its original class.',
    set: 'base',

    cursed: false,
    heroClass: HeroClass.Bard,
  },

  {
    id: 'item-073',
    name: 'Suspiciously Shiny Coin',
    type: CardType.Item,
    image: 'items/suspiciously-shiny-coin.png',
    description:
      "If you successfully roll to use the equipped Hero card's effect, DISCARD a card.",
    set: 'base',

    cursed: true,
  },
  {
    id: 'item-074',
    name: "Curse of the Snake's Eyes",
    type: CardType.Item,
    image: 'items/curse-of-the-snakes-eyes.png',
    description:
      "Each time you roll to use the equipped Hero card's effect, -2 to your roll.",
    set: 'base',

    cursed: true,
  },
  {
    id: 'item-075',
    name: "Curse of the Snake's Eyes",
    type: CardType.Item,
    image: 'items/curse-of-the-snakes-eyes.png',
    description:
      "Each time you roll to use the equipped Hero card's effect, -2 to your roll.",
    set: 'base',

    cursed: true,
  },
  {
    id: 'item-076',
    name: 'Sealing Key',
    type: CardType.Item,
    image: 'items/sealing-key.png',
    description: "You cannot use the equipped Hero card's effect.",
    set: 'base',

    cursed: true,
  },

  // add items...
]

export const baseMagic: MagicCardData[] = [
  {
    id: 'magic-049',
    name: 'Destructive Spell',
    type: CardType.Magic,
    image: 'magic/destructive-spell.png',
    description: 'DISCARD a card, then DESTROY a Hero card.',
    set: 'base',
  },
  {
    id: 'magic-050',
    name: 'Destructive Spell',
    type: CardType.Magic,
    image: 'magic/destructive-spell.png',
    description: 'DISCARD a card, then DESTROY a Hero card.',
    set: 'base',
  },
  {
    id: 'magic-051',
    name: 'Entangling Trap',
    type: CardType.Magic,
    image: 'magic/entangling-trap.png',
    description: 'DISCARD 2 cards, then STEAL a Hero card.',
    set: 'base',
  },
  {
    id: 'magic-052',
    name: 'Entangling Trap',
    type: CardType.Magic,
    image: 'magic/entangling-trap.png',
    description: 'DISCARD 2 cards, then STEAL a Hero card.',
    set: 'base',
  },
  {
    id: 'magic-053',
    name: 'Critical Boost',
    type: CardType.Magic,
    image: 'magic/critical-boost.png',
    description: 'DRAW 3 cards and DISCARD a card.',
    set: 'base',
  },
  {
    id: 'magic-054',
    name: 'Critical Boost',
    type: CardType.Magic,
    image: 'magic/critical-boost.png',
    description: 'DRAW 3 cards and DISCARD a card.',
    set: 'base',
  },
  {
    id: 'magic-055',
    name: 'Enchanted Spell',
    type: CardType.Magic,
    image: 'magic/enchanted-spell.png',
    description: '+2 to all of your rolls until the end of your turn.',
    set: 'base',
  },
  {
    id: 'magic-056',
    name: 'Enchanted Spell',
    type: CardType.Magic,
    image: 'magic/enchanted-spell.png',
    description: '+2 to all of your rolls until the end of your turn.',
    set: 'base',
  },
  {
    id: 'magic-057',
    name: 'Forced Exchange',
    type: CardType.Magic,
    image: 'magic/forced-exchange.png',
    description:
      "Choose a player. STEAL a Hero card from that player's Party, then move a Hero card from your Party to that player's Party.",
    set: 'base',
  },
  {
    id: 'magic-058',
    name: 'Winds of Change',
    type: CardType.Magic,
    image: 'magic/winds-of-change.png',
    description:
      "Return an Item card equipped to any player's Hero card to that player's hand, then DRAW a card.",
    set: 'base',
  },
  {
    id: 'magic-059',
    name: 'Winds of Change',
    type: CardType.Magic,
    image: 'magic/winds-of-change.png',
    description:
      "Return an Item card equipped to any player's Hero card to that player's hand, then DRAW a card.",
    set: 'base',
  },
  {
    id: 'magic-060',
    name: 'Forceful Winds',
    type: CardType.Magic,
    image: 'magic/forceful-winds.png',
    description:
      "Return every equipped Item card to its respective player's hand.",
    set: 'base',
  },
  {
    id: 'magic-061',
    name: 'Call to the Fallen',
    type: CardType.Magic,
    image: 'magic/call-to-the-fallen.png',
    description:
      'Search the discard pile for a Hero card and add it to your hand.',
    set: 'base',
  },

  // add magic cards...
]

export const baseModifiers: ModifierCardData[] = [
  {
    id: 'modifier-077',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier.png',
    description:
      'Play this card after any player (including you) rolls the dice. +2 or -2 to that roll.',
    set: 'base',
    values: [2, -2],
  },
  {
    id: 'modifier-078',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier.png',
    description:
      'Play this card after any player (including you) rolls the dice. +2 or -2 to that roll.',
    set: 'base',
    values: [2, -2],
  },
  {
    id: 'modifier-079',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier.png',
    description:
      'Play this card after any player (including you) rolls the dice. +2 or -2 to that roll.',
    set: 'base',
    values: [2, -2],
  },
  {
    id: 'modifier-080',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier.png',
    description:
      'Play this card after any player (including you) rolls the dice. +2 or -2 to that roll.',
    set: 'base',
    values: [2, -2],
  },
  {
    id: 'modifier-081',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier.png',
    description:
      'Play this card after any player (including you) rolls the dice. +2 or -2 to that roll.',
    set: 'base',
    values: [2, -2],
  },
  {
    id: 'modifier-082',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier.png',
    description:
      'Play this card after any player (including you) rolls the dice. +2 or -2 to that roll.',
    set: 'base',
    values: [2, -2],
  },
  {
    id: 'modifier-083',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier.png',
    description:
      'Play this card after any player (including you) rolls the dice. +2 or -2 to that roll.',
    set: 'base',
    values: [2, -2],
  },
  {
    id: 'modifier-084',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier.png',
    description:
      'Play this card after any player (including you) rolls the dice. +2 or -2 to that roll.',
    set: 'base',
    values: [2, -2],
  },
  {
    id: 'modifier-085',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier.png',
    description:
      'Play this card after any player (including you) rolls the dice. +2 or -2 to that roll.',
    set: 'base',
    values: [2, -2],
  },

  {
    id: 'modifier-086',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier-alt.png',
    description:
      'Play this card after any player (including you) rolls the dice. +3 or -1 to that roll.',
    set: 'base',
    values: [3, -1],
  },
  {
    id: 'modifier-087',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier-alt.png',
    description:
      'Play this card after any player (including you) rolls the dice. +3 or -1 to that roll.',
    set: 'base',
    values: [3, -1],
  },
  {
    id: 'modifier-088',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier-alt.png',
    description:
      'Play this card after any player (including you) rolls the dice. +3 or -1 to that roll.',
    set: 'base',
    values: [3, -1],
  },
  {
    id: 'modifier-089',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier-alt.png',
    description:
      'Play this card after any player (including you) rolls the dice. +3 or -1 to that roll.',
    set: 'base',
    values: [3, -1],
  },
  {
    id: 'modifier-090',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier-neg.png',
    description:
      'Play this card after any player (including you) rolls the dice. +1 or -3 to that roll.',
    set: 'base',
    values: [1, -3],
  },
  {
    id: 'modifier-091',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier-neg.png',
    description:
      'Play this card after any player (including you) rolls the dice. +1 or -3 to that roll.',
    set: 'base',
    values: [1, -3],
  },
  {
    id: 'modifier-092',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier-neg.png',
    description:
      'Play this card after any player (including you) rolls the dice. +1 or -3 to that roll.',
    set: 'base',
    values: [1, -3],
  },
  {
    id: 'modifier-093',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier-neg.png',
    description:
      'Play this card after any player (including you) rolls the dice. +1 or -3 to that roll.',
    set: 'base',
    values: [1, -3],
  },

  {
    id: 'modifier-094',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier-plus-4.png',
    description:
      'Play this card after any player (including you) rolls the dice. +4 to that roll.',
    set: 'base',
    values: [4],
  },
  {
    id: 'modifier-095',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier-plus-4.png',
    description:
      'Play this card after any player (including you) rolls the dice. +4 to that roll.',
    set: 'base',
    values: [4],
  },
  {
    id: 'modifier-096',
    name: 'Modifier',
    type: CardType.Modifier,
    image: 'modifiers/modifier-plus-4.png',
    description:
      'Play this card after any player (including you) rolls the dice. +4 to that roll.',
    set: 'base',
    values: [4],
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
  {
    id: 'challenge-105',
    name: 'Challenge',
    type: CardType.Challenge,
    image: 'challenges/challenge.png',
    description:
      'You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card.',
    set: 'base',
  },
  {
    id: 'challenge-106',
    name: 'Challenge',
    type: CardType.Challenge,
    image: 'challenges/challenge.png',
    description:
      'You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card.',
    set: 'base',
  },
  {
    id: 'challenge-107',
    name: 'Challenge',
    type: CardType.Challenge,
    image: 'challenges/challenge.png',
    description:
      'You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card.',
    set: 'base',
  },
  {
    id: 'challenge-108',
    name: 'Challenge',
    type: CardType.Challenge,
    image: 'challenges/challenge.png',
    description:
      'You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card.',
    set: 'base',
  },
  {
    id: 'challenge-109',
    name: 'Challenge',
    type: CardType.Challenge,
    image: 'challenges/challenge.png',
    description:
      'You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card.',
    set: 'base',
  },
  {
    id: 'challenge-110',
    name: 'Challenge',
    type: CardType.Challenge,
    image: 'challenges/challenge.png',
    description:
      'You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card.',
    set: 'base',
  },
  {
    id: 'challenge-111',
    name: 'Challenge',
    type: CardType.Challenge,
    image: 'challenges/challenge.png',
    description:
      'You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card.',
    set: 'base',
  },
  {
    id: 'challenge-112',
    name: 'Challenge',
    type: CardType.Challenge,
    image: 'challenges/challenge.png',
    description:
      'You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card.',
    set: 'base',
  },
  {
    id: 'challenge-113',
    name: 'Challenge',
    type: CardType.Challenge,
    image: 'challenges/challenge.png',
    description:
      'You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card.',
    set: 'base',
  },
  {
    id: 'challenge-114',
    name: 'Challenge',
    type: CardType.Challenge,
    image: 'challenges/challenge.png',
    description:
      'You may play this card when another player attempts to play a Hero, Item, or Magic card. CHALLENGE that card.',
    set: 'base',
  },
  {
    id: 'challenge-115',
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
    id: 'leader-116',
    name: 'The Divine Arrow',
    type: CardType.Leader,
    image: 'leaders/the-divine-arrow.png',
    description:
      'Each time you roll to ATTACK a Monster card, +1 to your roll.',
    set: 'base',
    heroClass: HeroClass.Ranger,
  },
  {
    id: 'leader-117',
    name: 'The Shadow Claw',
    type: CardType.Leader,
    image: 'leaders/the-shadow-claw.png',
    description:
      "Once per turn on your turn, you may spend an action point to pull a card from another player's hand.",
    set: 'base',
    heroClass: HeroClass.Thief,
  },
  {
    id: 'leader-118',
    name: 'The Fist of Reason',
    type: CardType.Leader,
    image: 'leaders/the-fist-of-reason.png',
    description: 'Each time you roll to CHALLENGE, +2 to your roll.',
    set: 'base',
    heroClass: HeroClass.Fighter,
  },
  {
    id: 'leader-119',
    name: 'The Charismatic Song',
    type: CardType.Leader,
    image: 'leaders/the-charismatic-song.png',
    description:
      "Each time you roll to use a Hero card's effect, +1 to your roll.",
    set: 'base',
    heroClass: HeroClass.Bard,
  },
  {
    id: 'leader-120',
    name: 'The Cloaked Sage',
    type: CardType.Leader,
    image: 'leaders/the-cloaked-sage.png',
    description: 'Each time you play a Magic card, DRAW a card.',
    set: 'base',
    heroClass: HeroClass.Wizard,
  },
  {
    id: 'leader-121',
    name: 'The Protecting Horn',
    type: CardType.Leader,
    image: 'leaders/the-protecting-horn.png',
    description:
      'Each time you play a Modifier card on a roll, +1 or -1 to that roll.',
    set: 'base',
    heroClass: HeroClass.Guardian,
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
