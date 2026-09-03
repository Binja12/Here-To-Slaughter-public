import {
  HeroClass,
  CardType,
  ReactionWindowType,
  DecisionType,
  ActionFlow,
  TurnTimerMode,
  WinConditionType,
  RollCompareMode,
  ChallengeResult,
  RefusalReason,
} from "./enums";

export type HeroClassReq = HeroClass | "Any";

export type PartyReq = {
  classes: HeroClassReq[];
};

/** Printed outcome when a monster's attack roll lands in its fight-back range. */
export type FightBackData = {
  description: string;
};

/**
 * Card DATA is display + rule numbers only. Card BEHAVIOUR (trigger + task
 * steps) lives server-side in the ability registry, keyed by card id — it is
 * built from live ITask instances, which cannot survive a clone or reach the
 * client, and the client has no business knowing a card's pipeline anyway.
 */
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
};

export type ItemCardData = CardBase & {
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
  slay?: string;
  fightBack?: FightBackData;
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
  /**
   * Hero id -> the item it carries. Party state rather than card state, so a
   * frame snapshot covers it: GameState.clone() shares the card map by
   * reference, and equipment has to roll back with a lost challenge.
   */
  equipment?: Record<string, string>;
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

// ---------------------------------------------------------------------------
// What a player request comes back with. Expected refusals are RESULTS, never
// exceptions: a throw inside the engine is an engine mistake, this is a
// player's. `accepted` means the engine TOOK the request, not that the play
// succeeded — a challenged hero that loses its roll was still accepted.
// ---------------------------------------------------------------------------

export type RequestResult =
  | { accepted: true }
  | { accepted: false; reason: RefusalReason };
