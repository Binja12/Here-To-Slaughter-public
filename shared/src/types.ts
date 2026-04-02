import {
  EffectDuration,
  HeroClass,
  CardType,
  ReactionWindowType,
  DecisionType,
  ActionFlow,
  TurnTimerMode,
  WinConditionType,
  RollCompareMode,
} from "./enums";

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
  set: string;
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
  lowerReq: number;
  higherReq: number;
  rollCompareMode: RollCompareMode;
  partyReq: PartyReq;
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
  monsterIds: string[];
};

export type PlayerData = {
  id: string;
  name: string;
  hand: string[];
  partyId: string;
  actionPointsPerTurn: number;
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

export enum ChallengeResult {
  NoChallengeOrWon = "NoChallengeOrWon",
  ChallengerWon = "ChallengerWon",
}

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
