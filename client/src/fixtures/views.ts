import {
  CardView,
  ChallengeCardData,
  HeroCardData,
  ItemCardData,
  MagicCardData,
  ModifierCardData,
  MonsterCardData,
  PartyLeaderData,
  PartyView,
  PendingWindowView,
  PlayerView,
} from '../contract'

const common = { description: '', set: 'base' }

const hero = (
  id: string,
  name: string,
  image: string,
  heroClass: HeroCardData['heroClass'],
): HeroCardData => ({
  ...common,
  id,
  name,
  type: 'Hero',
  image: `heroes/${image}.png`,
  heroClass,
  rollReq: 7,
})

const leader = (
  id: string,
  name: string,
  image: string,
  heroClass: PartyLeaderData['heroClass'],
): PartyLeaderData => ({
  ...common,
  id,
  name,
  type: 'Leader',
  image: `leaders/${image}.png`,
  heroClass,
  rollReq: 7,
})

const monster = (
  id: string,
  name: string,
  image: string,
): MonsterCardData => ({
  ...common,
  id,
  name,
  type: 'Monster',
  image: `monsters/${image}.png`,
  lowerReq: 5,
  higherReq: 8,
  rollCompareMode: 'HighToWin',
  partyReq: { classes: ['Any'] },
})

const item = (
  id: string,
  name: string,
  image: string,
  cursed = false,
): ItemCardData => ({
  ...common,
  id,
  name,
  type: 'Item',
  image: `items/${image}.png`,
  cursed,
})

const magic = (id: string, name: string, image: string): MagicCardData => ({
  ...common,
  id,
  name,
  type: 'Magic',
  image: `magic/${image}.png`,
})

const modifier = (id: string, values: number[]): ModifierCardData => ({
  ...common,
  id,
  name: 'Modifier',
  type: 'Modifier',
  image: 'modifiers/modifier.png',
  values,
})

const challenge: ChallengeCardData = {
  ...common,
  id: 'challenge-102',
  name: 'Challenge',
  type: 'Challenge',
  image: 'challenges/challenge.png',
}

const badAxe = hero('hero-001', 'Bad Axe', 'bad-axe', 'Fighter')
const wildshot = hero('hero-012', 'Wildshot', 'wildshot', 'Ranger')
const meowzio = hero('hero-019', 'Meowzio', 'meowzio', 'Thief')
const guidingLight = hero(
  'hero-025',
  'Guiding Light',
  'guiding-light',
  'Guardian',
)
const wiggles = hero('hero-036', 'Wiggles', 'wiggles', 'Wizard')
const fuzzyCheeks = hero('hero-043', 'Fuzzy Cheeks', 'fuzzy-cheeks', 'Bard')
const luckyBucky = hero('hero-042', 'Lucky Bucky', 'lucky-bucky', 'Bard')

const divineArrow = leader(
  'leader-116',
  'The Divine Arrow',
  'the-divine-arrow',
  'Ranger',
)
export const shadowClaw = leader(
  'leader-117',
  'The Shadow Claw',
  'the-shadow-claw',
  'Thief',
)
const fistOfReason = leader(
  'leader-118',
  'The Fist of Reason',
  'the-fist-of-reason',
  'Fighter',
)
const bigRing = item('item-064', 'Really Big Ring', 'really-big-ring')
const rustyCoin = item(
  'item-062',
  'Particularly Rusty Coin',
  'particularly-rusty-coin',
)
const thiefMask = item('item-069', 'Thief Mask', 'thief-mask')
const cursedCoin = item(
  'item-073',
  'Suspiciously Shiny Coin',
  'suspiciously-shiny-coin',
  true,
)
const destructiveSpell = magic(
  'magic-049',
  'Destructive Spell',
  'destructive-spell',
)
const criticalBoost = magic('magic-053', 'Critical Boost', 'critical-boost')
const forcedExchange = magic('magic-057', 'Forced Exchange', 'forced-exchange')
const windsOfChange = magic('magic-058', 'Winds of Change', 'winds-of-change')
// Forceful Winds stands in for Call to the Fallen, the one magic card with
// no edited board scan yet (it would fall back to the basic template, which
// the owner does not want on the table — 2026-09-03)
const callToFallen = magic('magic-061', 'Forceful Winds', 'forceful-winds')
const plusMinusTwo = modifier('modifier-077', [2, -2])
const plusThreeMinusOne = modifier('modifier-086', [3, -1])
const plusFour = modifier('modifier-094', [4])

const megaSlime = monster('monster-123', 'Mega Slime', 'mega-slime')
const crownedSerpent = monster(
  'monster-125',
  'Crowned Serpent',
  'crowned-serpent',
)
const bloodwing = monster('monster-127', 'Bloodwing', 'bloodwing')
const abyssQueen = monster('monster-129', 'Abyss Queen', 'abyss-queen')
const darkDragonKing = monster(
  'monster-133',
  'Dark Dragon King',
  'dark-dragon-king',
)
const titanWyvern = monster('monster-136', 'Titan Wyvern', 'titan-wyvern')

const openingHand: CardView[] = [
  luckyBucky,
  bigRing,
  criticalBoost,
  plusMinusTwo,
  challenge,
]

const emptyParty = (playerId: string, partyLeader: CardView): PartyView => ({
  playerId,
  leader: partyLeader,
  heroes: [],
  monsters: [],
  instanceCards: [],
  canRollOnLeader: false,
})

export const threeSeatOpening: PlayerView = {
  gameId: 'fixture-game',
  playerId: 'player-a',
  seats: [
    {
      playerId: 'player-a',
      name: 'You',
      seat: 0,
      isCurrentTurn: true,
      actionPoints: 3,
      handCount: 5,
      effects: [],
    },
    {
      playerId: 'player-b',
      name: 'Mira',
      seat: 1,
      isCurrentTurn: false,
      actionPoints: 3,
      handCount: 5,
      effects: [],
    },
    {
      playerId: 'player-c',
      name: 'Rook',
      seat: 2,
      isCurrentTurn: false,
      actionPoints: 3,
      handCount: 5,
      effects: [],
    },
  ],
  currentPlayerId: 'player-a',
  phase: 'Turns',
  hand: openingHand,
  parties: [
    emptyParty('player-a', divineArrow),
    emptyParty('player-b', shadowClaw),
    emptyParty('player-c', fistOfReason),
  ],
  mainDeck: { count: 82 },
  monsterDeck: { count: 12 },
  discardPile: [],
  monsterRow: [megaSlime, titanWyvern, abyssQueen],
  attackableMonsterIds: [],
  // the three fixture leaders: two passives (Divine Arrow, Fist of Reason)
  // and the ACTIVATED Shadow Claw, which never glows pink
  passiveCardIds: [divineArrow.id, fistOfReason.id],
  revealedCards: [],

  pendingWindows: [],
  busy: false,
}

export const midGame: PlayerView = {
  ...threeSeatOpening,
  seats: [
    { ...threeSeatOpening.seats[0], actionPoints: 3, handCount: 10 },
    ...threeSeatOpening.seats.slice(1),
  ],
  hand: [
    badAxe,
    wildshot,
    guidingLight,
    rustyCoin,
    cursedCoin,
    destructiveSpell,
    forcedExchange,
    plusThreeMinusOne,
    plusFour,
    challenge,
  ],
  parties: [
    {
      playerId: 'player-a',
      leader: divineArrow,
      heroes: [
        { card: fuzzyCheeks, equippedItem: bigRing, canRollOn: true },
        { card: wildshot, canRollOn: false },
        { card: meowzio, equippedItem: thiefMask, canRollOn: true },
      ],
      monsters: [darkDragonKing, crownedSerpent],
      instanceCards: [windsOfChange, callToFallen],
      canRollOnLeader: true,
    },
    {
      playerId: 'player-b',
      leader: shadowClaw,
      heroes: [{ card: luckyBucky, canRollOn: true }],
      monsters: [bloodwing],
      instanceCards: [],
      canRollOnLeader: false,
    },
    {
      playerId: 'player-c',
      leader: fistOfReason,
      heroes: [{ card: wiggles, canRollOn: true }],
      monsters: [],
      instanceCards: [criticalBoost],
      canRollOnLeader: false,
    },
  ],
  mainDeck: { count: 45 },
  monsterDeck: { count: 7 },
  discardPile: [destructiveSpell, rustyCoin, plusMinusTwo],
  attackableMonsterIds: [titanWyvern.id],
}

const withWindow = (
  base: PlayerView,
  window: PendingWindowView,
): PlayerView => ({
  ...base,
  pendingWindows: [window],
  busy: true,
})

export const myTaskChoice = withWindow(threeSeatOpening, {
  windowId: 'window-task',
  type: 'TaskChoice',
  respondentId: 'player-a',
  options: ['confirm', 'dismiss'],
  optional: true,
  deadline: Date.now() + 30_000,
  isYours: true,
})

export const myValueChoice = withWindow(threeSeatOpening, {
  windowId: 'window-value',
  type: 'ValueChoice',
  respondentId: 'player-a',
  options: [3, -1],
  deadline: Date.now() + 30_000,
  isYours: true,
})

export const myCardChoice = withWindow(threeSeatOpening, {
  windowId: 'window-card',
  type: 'CardChoice',
  respondentId: 'player-a',
  options: openingHand.slice(0, 3).map((card) => card.id),
  deadline: Date.now() + 30_000,
  isYours: true,
})

export const opponentsChoice = withWindow(threeSeatOpening, {
  windowId: 'window-opponent',
  type: 'TaskChoice',
  respondentId: 'player-b',
  deadline: Date.now() + 30_000,
  isYours: false,
})

export const modifierWindowOpen = withWindow(threeSeatOpening, {
  windowId: 'window-modifier',
  type: 'Modifier',
  canPass: true,
  respondentId: 'player-b',
  // Server shape (ModifiableRollWindow.getDetail): the roll and its bonuses,
  // plus the subject — `heroId` for a hero/leader roll, `monsterId` for an
  // attack. A Modifier window has no `cardId`; the subject lives in detail.
  detail: {
    rollerId: 'player-b',
    baseRoll: 7,
    bonuses: [{ cardSource: titanWyvern.id, amount: 1 }],
    finalRoll: 8,
    rollReq: 9,
    heroId: titanWyvern.id,
  },
  deadline: Date.now() + 30_000,
  isYours: false,
})

// Server shape (ChallengeWindow.getDetail). `challenged: false` = the card
// may still be challenged; `true` = somebody did and both sides have rolled.
const challengeDetail = {
  defenderId: 'player-b',
  cardId: luckyBucky.id,
  challengeable: true,
  challenged: false,
  challengerId: undefined,
  challengerRoll: 0,
  challengedRoll: 0,
  challengerBonuses: [],
  challengedBonuses: [],
}

export const challengeWindowOpen = withWindow(midGame, {
  windowId: 'window-challenge',
  type: 'Challenge',
  canPass: true,
  respondentId: 'player-b',
  cardId: luckyBucky.id,
  detail: challengeDetail,
  deadline: Date.now() + 30_000,
  isYours: false,
})

export const challengeStarted = withWindow(midGame, {
  windowId: 'window-challenge',
  type: 'Challenge',
  respondentId: 'player-b',
  cardId: luckyBucky.id,
  detail: {
    ...challengeDetail,
    challengeable: false,
    challenged: true,
    challengerId: 'player-a',
    challengerRoll: 6,
    challengedRoll: 8,
    challengedBonuses: [{ cardSource: luckyBucky.id, amount: 1 }],
  },
  deadline: Date.now() + 30_000,
  isYours: false,
})

/**
 * The Crowned Serpent's "you may draw", asked of its owner about a monster
 * won into their OWN party while the roll it is watching still stands: the
 * board has nothing for them to press, so the ask takes the stage over the
 * modifier window instead of a strip card under it.
 */
export const monsterAsksOverRoll: PlayerView = {
  ...midGame,
  busy: true,
  pendingWindows: [
    modifierWindowOpen.pendingWindows[0],
    {
      windowId: 'window-serpent',
      type: 'TaskChoice',
      respondentId: 'player-a',
      options: ['confirm', 'dismiss'],
      optional: true,
      detail: {
        confirms: 'CrownedSerpentDraws',
        sourceCardId: crownedSerpent.id,
      },
      deadline: Date.now() + 30_000,
      isYours: true,
    },
  ],
}

/** An opponent's roll has chosen this seat's HAND — the red screen edge. */
export const rollTargetsYou: PlayerView = {
  ...midGame,
  busy: true,
  pendingWindows: [
    {
      ...modifierWindowOpen.pendingWindows[0],
      detail: {
        ...modifierWindowOpen.pendingWindows[0].detail,
        targets: [{ playerId: 'player-a', zone: 'Hand' }],
      },
    },
  ],
}

export const opponentsTurnIdle: PlayerView = {
  ...threeSeatOpening,
  currentPlayerId: 'player-b',
  seats: threeSeatOpening.seats.map((seat) => ({
    ...seat,
    isCurrentTurn: seat.playerId === 'player-b',
  })),
}

export const fixtures = {
  threeSeatOpening,
  midGame,
  myTaskChoice,
  myValueChoice,
  myCardChoice,
  opponentsChoice,
  modifierWindowOpen,
  challengeWindowOpen,
  opponentsTurnIdle,
}

export type FixtureName = keyof typeof fixtures
