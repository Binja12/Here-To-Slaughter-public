import { EffectDuration, HeroClass, CardType } from "./enums";

export type HeroClassReq = HeroClass | "Any";

export type PartyReq = {
  classes: HeroClassReq[];
};

export type EffectData = {
  rollBonus?: number;
  attackBonus?: number;
  duration: EffectDuration;
};

export type SkillData = {
  condition: string;
  description: string;
};

export type CardBase = {
  id: string;
  name: string;
  type: CardType;
  image: string;
  description: string;
};

export type HeroCardData = CardBase & {
  heroClass: HeroClass;
  rollReq: number;
  effect: EffectData;
  equippedItem?: string;
};

export type ItemCardData = CardBase & {
  effect: EffectData;
  equippedHero?: string;
  cursed: boolean;
};

export type MagicCardData = CardBase & {
  effect: EffectData;
};

export type ModifierCardData = CardBase & {
  values: number[];
  condition?: string;
};

export type ChallengeCardData = CardBase;

export type MonsterCardData = CardBase & {
  partyReq: PartyReq;
  rollWinReq: number;
  rollLoseReq: number;
  skill: SkillData;
};

export type PartyLeaderData = CardBase & {
  heroClass: HeroClass;
  skill: SkillData;
};

export type CardStackData = {
  id: string;
  name: string;
  cards: string[];
};

export type CardPileData = {
  id: string;
  name: string;
  cards: string[];
};

export type PartyData = {
  playerId: string;
  leaderId: string;
  heroIds: string[];
  MonsterIds: string[];
};

export type PlayerData = {
  id: string;
  name: string;
  hand: string[];
  partyId: string;
  actionPointsPerTurn: number;
};
