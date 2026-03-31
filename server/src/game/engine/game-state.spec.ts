import {
  HeroCardData,
  MonsterCardData,
  ItemCardData,
  MagicCardData,
  ModifierCardData,
  ChallengeCardData,
  PartyLeaderData,
} from 'shared'
import { CardType, HeroClass, EffectDuration } from 'shared'

export const baseHeroes: HeroCardData[] = [
  {
    id: 'hero-001',
    name: 'Zara the Wizard',
    type: CardType.Hero,
    image: 'heroes/zara.png',
    description: 'Roll to draw a card',
    set: 'base',
    heroClass: HeroClass.Wizard,
    rollReq: 4,
    effect: {
      duration: EffectDuration.TurnEnd,
      rollBonus: 0,
    },
  },
  // add more heroes...
]

export const baseMonsters: MonsterCardData[] = [
  {
    id: 'monster-001',
    name: 'Corrupted Unicorn',
    type: CardType.Monster,
    image: 'monsters/corrupted-unicorn.png',
    description: 'Slay to draw 2 cards',
    set: 'base',
    rollWinReq: 7,
    rollLoseReq: 3,
    partyReq: { classes: ['Any', 'Any'] },
    skill: {
      condition: 'When face up',
      description: 'All rolls -1',
    },
  },
  // add more monsters...
]

export const baseItems: ItemCardData[] = [
  // add items...
]

export const baseMagic: MagicCardData[] = [
  // add magic cards...
]

export const baseModifiers: ModifierCardData[] = [
  // add modifiers...
]

export const baseChallenges: ChallengeCardData[] = [
  // add challenges...
]

export const baseLeaders: PartyLeaderData[] = [
  {
    id: 'leader-001',
    name: 'The Arcane Mage',
    type: CardType.Leader,
    image: 'leaders/arcane-mage.png',
    description: 'Each time you play a Magic card, draw a card',
    set: 'base',
    heroClass: HeroClass.Wizard,
    skill: {
      condition: 'Each time you play a Magic card',
      description: 'Draw a card',
    },
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
