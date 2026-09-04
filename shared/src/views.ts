import {
  CardType,
  PassiveType,
  ReactionWindowType,
  RollContext,
  GamePhase,
} from "./enums";
import {
  ChallengeCardData,
  HeroCardData,
  ItemCardData,
  MagicCardData,
  ModifierCardData,
  MonsterCardData,
  PartyLeaderData,
} from "./types";

// ---------------------------------------------------------------------------
// The client contract: what ONE player is allowed to see.
//
// A face-up card is NAMED, a face-down one is COUNTED — which is why
// `PlayerView.hand` is cards and `SeatView.handCount` is a number. Built by
// `server/src/game/views/player-view.ts`; plain data throughout, so it
// serialises as it stands.
// ---------------------------------------------------------------------------

/** The printed face of a card, discriminated by `type`. */
export type CardData =
  | HeroCardData
  | ItemCardData
  | MagicCardData
  | ModifierCardData
  | ChallengeCardData
  | MonsterCardData
  | PartyLeaderData;

/** A card the player may see. DATA only — behaviour is server-side (§1). */
export type CardView = CardData;

/** A face-down zone: how many are left is public, which cards they are is not. */
export type HiddenZoneView = {
  count: number;
};

/** A hero standing in a party, with whatever it carries. */
export type HeroInPlayView = {
  card: CardView;
  /** The item on this hero, if any. Equipment is face up like the hero. */
  equippedItem?: CardView;
  /**
   * Whether this hero's printed effect can still be rolled for — the once-per-
   * turn slot and `CantUseHeroEffect`. The server's answer, so a screen cannot
   * offer what the engine refuses.
   */
  canRollOn: boolean;
};

/** A standing rule on a player. Public — `EffectApplied` goes to the table. */
export type EffectView = {
  id: string;
  /** The card whose ability installed it — what the screen names it by. */
  sourceCardId: string;
  type: PassiveType;
  value?: number;
  /** Present when it applies to rolls about one card only. */
  cardId?: string;
  /** Present when it applies to one kind of roll only. */
  rollContext?: RollContext;
  /** Present when it applies to plays of these card types only. */
  cardTypes?: CardType[];
};

/** One party on the table. Everything in a party is face up to everyone. */
export type PartyView = {
  playerId: string;
  leader: CardView;
  heroes: HeroInPlayView[];
  /** Monsters this party has slain. */
  monsters: CardView[];
  /** Cards on the table mid-resolution. Face up, like the rest of a party (§1). */
  instanceCards: CardView[];
  /** Whether the leader's once-per-turn activation is still available. */
  canRollOnLeader: boolean;
};

/** One seat. Everything here is public — including how many cards are held. */
export type SeatView = {
  playerId: string;
  name: string;
  /** Position in the turn rotation. */
  seat: number;
  isCurrentTurn: boolean;
  actionPoints: number;
  /** A COUNT, never ids — a hand is face down to everyone but its owner. */
  handCount: number;
  effects: EffectView[];
};

/**
 * A reaction window waiting for an answer. Listed for everyone — an open
 * window stops the game — but `options` reaches its respondent only.
 */
export type PendingWindowView = {
  windowId: string;
  type: ReactionWindowType;
  /** The roller, the defender, or the only legal answerer of a choice. */
  respondentId: string;
  /** The card the window is about, for the windows that settle on one. */
  cardId?: string;
  /** Present only when `respondentId` is the viewer. */
  options?: unknown[];
  /**
   * The options that are CARDS, as printed data, for the respondent only —
   * a choice over cards nowhere on the viewer's screen (Bullseye's look at
   * the deck's top three) has nothing else to draw.
   */
  optionCards?: CardView[];
  /**
   * What the window is asking, as the engine sees it now: a roll's base,
   * bonuses and running total with its requirement, a challenge's two rolls,
   * a choice's question. A roll or a challenge is the table's business and
   * reaches everyone; a choice's question reaches its respondent only, like
   * `options`, because it can name cards nobody else may see.
   */
  detail?: Record<string, unknown>;
  /** When the window lapses, epoch ms. */
  deadline: number;
  /** Whether this window is the viewer's to answer. */
  isYours: boolean;
};

/** The active seat's turn clock, one for the table. Exactly one of `deadline` / `heldMs` is present. */
export type TurnClockView = {
  turnTimeMs: number;
  /** Epoch ms of the lapse while the clock runs. Fixed per running stretch, so snapshots agree and the screen ticks between them. */
  deadline?: number;
  /** ms left while a reaction window holds the clock. */
  heldMs?: number;
};

/**
 * Everything one player's screen is drawn from, at one moment. Sent whole on
 * every update rather than as a diff — the board is small.
 */
export type PlayerView = {
  gameId: string;
  /** Whose view this is. The one player whose hand is named below. */
  playerId: string;
  /** Seat order, which is the turn rotation. */
  seats: SeatView[];
  currentPlayerId?: string;
  phase: GamePhase;
  /** Present once `phase` is `Concluded`: the seat that won. */
  winnerId?: string;
  /** Your own hand, face up to you alone. */
  hand: CardView[];
  /** Every party, including your own. */
  parties: PartyView[];
  mainDeck: HiddenZoneView;
  monsterDeck: HiddenZoneView;
  /** Face up, newest first — the order `CardPile` holds. */
  discardPile: CardView[];
  /**
   * Cards being SHOWN to you right now — a look at a hand, a revealed draw —
   * without moving. The engine puts them here (RevealTask) and takes them off
   * when its clock runs out; how to show them is the client's.
   */
  revealedCards: CardView[];
  /** The face-up monster row. Refilled from the monster deck as it empties. */
  monsterRow: CardView[];
  /**
   * The monsters YOUR party may attack right now — `GameState.canAttackMonster`,
   * the same question the action and the choice window ask.
   */
  attackableMonsterIds: string[];
  pendingWindows: PendingWindowView[];
  /** Absent on a table played without a clock. */
  turnClock?: TurnClockView;
  /** `GameState.isBusy` — mid-resolution, so no action will be accepted. */
  busy: boolean;
};
