import { CardType, HeroClass, RollCompareMode } from './enums'

export type CardBase = {
  id: string
  name: string
  type: CardType
  image: string
  description: string
  set: string
}

export type HeroCardData = CardBase & {
  type: 'Hero'
  heroClass: HeroClass
  rollReq: number
}

export type ItemCardData = CardBase & {
  type: 'Item'
  cursed?: boolean
}

export type MagicCardData = CardBase & { type: 'Magic' }

export type ModifierCardData = CardBase & {
  type: 'Modifier'
  values: number[]
}

export type ChallengeCardData = CardBase & { type: 'Challenge' }

export type MonsterCardData = CardBase & {
  type: 'Monster'
  higherReq: number
  lowerReq: number
  rollCompareMode: RollCompareMode
  partyReq: { classes: (HeroClass | 'Any')[] }
}

export type PartyLeaderData = CardBase & {
  type: 'Leader'
  heroClass: HeroClass
  rollReq: number
}
