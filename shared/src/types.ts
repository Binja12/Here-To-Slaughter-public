import {
  EffectDuration,
  HeroClass,
  CardType,
  GameEventType,
  ReactionWindowType,
  DecisionType,
  ActionFlow,
  TurnTimerMode,
  WinConditionType,
  RollCompareMode,
  ChallengeResult,
} from "./enums";

import { IGameEvent } from "./interfaces";

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

export type AbilityData = {
  trigger: GameEventType;
};

export type CardBase = {
  id: string;
  name: string;
  type: CardType;
  image: string;
  description: string;
  set: string;
  ability?: AbilityData;
  effect?: EffectData;
  skill?: SkillData;
};

export type HeroCardData = CardBase & {
  heroClass: HeroClass;
  rollReq: number;
  equippedItem?: string;
};

export type ItemCardData = CardBase & {
  equippedHero?: string;
  cursed: boolean;
};

export type MagicCardData = CardBase;

export type ModifierCardData = CardBase & {
  values: number[];
};

export type ChallengeCardData = CardBase;

export type MonsterCardData = CardBase & {
  lowerReq: number;
  higherReq: number;
  rollCompareMode: RollCompareMode;
  partyReq: PartyReq;
  fightBack?: AbilityData;
};

export type PartyLeaderData = CardBase & {
  heroClass: HeroClass;
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
  monsterIds: string[];
  instanceCardIds?: string[];
};

export type PlayerData = {
  id: string;
  name: string;
  hand: string[];
  partyId: string;
  actionPoints: number;
};

export type PlayerResponse = {
  playerId: string;
  response: "Challenge" | "Modifier";
  cardId: string;
  timestamp: number;
};

export type ReactionWindow = {
  type: ReactionWindowType;
  pendingActionId: string;
  timeoutMs: number;
  openedAt: number;
  lastActivityAt: number;
  responses: PlayerResponse[];
  resolved: boolean;
  challengerWon?: boolean;
};

export type ChallengeChecker = () => Promise<ChallengeResult>;

export type PendingDecision = {
  type: DecisionType;
  playerId: string;
  options?: string[];
  count?: number;
};

export type GameConfig = {
  playerCount: { min: number; max: number };
  startingHandSize: number;
  actionPointsPerTurn: number;
  cardSets: string[];
  timeControl: TimeControl;
  winConditions: WinConditionConfig[];
  flawPlay: boolean;
};

export type TimeControl = {
  name: string;
  reactionCountdownMs: number;
  actionFlow: ActionFlow;
  turnTimerMode?: TurnTimerMode; // undefined = unlimited
  turnTimeMs?: number; // time per turn if PerTurn mode
  totalTimeMs?: number; // total time bank if TotalTime mode
  bonusTimeMs?: number; // added after each action (like chess increment)
};

export type WinConditionConfig = {
  type: WinConditionType;
  value: number; // SlayMonsters: how many, PartyClasses: how many different classes
};
