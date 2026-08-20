export enum CardType {
  Hero = "Hero",
  Item = "Item",
  Magic = "Magic",
  Modifier = "Modifier",
  Challenge = "Challenge",
  Monster = "Monster",
  Leader = "Leader",
}

export enum HeroClass {
  Fighter = "Fighter",
  Guardian = "Guardian",
  Ranger = "Ranger",
  Thief = "Thief",
  Wizard = "Wizard",
  Bard = "Bard",
}

export enum GamePhase {
  Setup = "Setup",
  Playthrough = "Playthrough",
  EndGame = "EndGame",
}

export enum TurnPhase {
  TurnStart = "TurnStart",
  ActionWindow = "ActionWindow",
  ReactionWindow = "ReactionWindow",
  TurnEnd = "TurnEnd",
}

export enum ReactionWindowType {
  Challenge = "Challenge",
  Modifier = "Modifier",
  PlayerChoice = "PlayerChoice",
  CardChoice = "CardChoice",
  TaskChoice = "TaskChoice",
}

export enum RollContext {
  Any = "Any",
  Challenge = "Challenge",
  Attack = "Attack",
  HeroEffect = "HeroEffect",
}

export enum ActionSource {
  Player = "Player",
  CardEffect = "CardEffect",
  PlayHeroTrigger = "PlayHeroTrigger",
  PlayItemTrigger = "PlayItemTrigger",
}

export enum GameEventType {
  // Card events
  CardDrawn = "CardDrawn",
  CardPlayed = "CardPlayed",
  CardDiscarded = "CardDiscarded",
  /** A card left a hand to be played. Every play type emits this first. */
  CardRemovedFromHand = "CardRemovedFromHand",
  MagicPlayed = "MagicPlayed",
  /** A modifier card was spent. ModifierApplied reports the bonus landing. */
  ModifierPlayed = "ModifierPlayed",

  // Hero events
  HeroAddedToParty = "HeroAddedToParty",
  HeroSacrificed = "HeroSacrificed",
  HeroDestroyed = "HeroDestroyed",
  HeroStolen = "HeroStolen",
  /**
   * Canonical "a hero left a party" — emitted by the one removal choke point
   * (game/party-ops.ts) alongside the specific event above; payload carries a
   * `reason`. Subscribe to THIS when you only care that a hero left at all —
   * effect expiries do — so a future removal mechanic is one new reason at the
   * choke point, not an update to every listener.
   */
  HeroRemovedFromParty = "HeroRemovedFromParty",

  // Monster events
  MonsterSlain = "MonsterSlain",
  MonsterFlipped = "MonsterFlipped",

  // Turn events
  TurnStarted = "TurnStarted",
  TurnEnded = "TurnEnded",

  // Item events
  ItemEquippedToHero = "ItemEquippedToHero",
  /**
   * An item came off a hero that stayed in play — replaced by another. Effects
   * the item installed expire on this; see `whileEquipped`.
   */
  ItemUnequipped = "ItemUnequipped",

  // Game events
  GameStarted = "GameStarted",
  GameEnded = "GameEnded",
  DiceRolled = "DiceRolled",
  RollSuccess = "RollSuccess",

  // Ongoing effects — installed by an ability, removed when their lifetime ends
  EffectApplied = "EffectApplied",
  EffectExpired = "EffectExpired",

  /**
   * A card's printed behaviour has finished: the last pipeline sourced to it
   * left the stack. `{ cardId }`. System rules neither raise nor delay it.
   * Read by instance-rules.ts.
   */
  AbilityDone = "AbilityDone",

  // Reaction frame
  FrameResolved = "FrameResolved",

  /**
   * A player said YES to a ConfirmTask. `{ cardId, label, ctxSeed? }` — the
   * follow-up is a registry entry triggered by this. DISMISS emits nothing.
   */
  TaskConfirmed = "TaskConfirmed",

  /**
   * A condition held. Same shape as TaskConfirmed: the steps it guards are a
   * registry entry triggered by this. A failing condition emits nothing.
   */
  ConditionMet = "ConditionMet",

  // Reaction window lifecycle — EVERY window emits this pair. windowType is in
  // the payload, so consumers subscribe once instead of once per window kind.
  ReactionWindowOpened = "ReactionWindowOpened",
  ReactionWindowClosed = "ReactionWindowClosed",

  // Modifier window — domain events, not lifecycle
  ModifierApplied = "ModifierApplied",
  ModifierResolved = "ModifierResolved",
  // Challenge window — domain events, not lifecycle
  CardPlayAttempted = "CardPlayAttempted",
  ChallengeStarted = "ChallengeStarted",
  ChallengeResolved = "ChallengeResolved",
}

export enum DecisionType {
  PickCardsFromHand = "PickCardsFromHand",
  PickHeroFromParty = "PickHeroFromParty",
  PickPlayer = "PickPlayer",
  PickMonster = "PickMonster",
}

export enum ActionFlow {
  Instant = "Instant", // no reaction windows, execute immediately
  WithReactions = "WithReactions", // save snapshot, wait for reactions
}

export enum TurnTimerMode {
  PerTurn = "PerTurn", // each turn has its own timer, resets every turn
  TotalTime = "TotalTime", // each player has a total time bank for whole game
}

export enum WinConditionType {
  SlayMonsters = "SlayMonsters",
  PartyClasses = "PartyClasses",
}

export enum RollResult {
  // Hero
  Success = "Success",
  Failure = "Failure",
  // Monster
  Slay = "Slay",
  FightBack = "FightBack",
  Miss = "Miss",
  // Challenge
  ChallengerWins = "ChallengerWins",
  ChallengerLoses = "ChallengerLoses",
}

export enum RollCompareMode {
  HighToWin = "HighToWin", // normal: roll >= winReq → slay
  LowToWin = "LowToWin", // special: roll <= winReq → slay
}

export enum SelectionMode {
  PlayerChooses = "PlayerChooses",
  OpponentChooses = "OpponentChooses",
  Random = "Random",
}

// ---------------------------------------------------------------------------
// Card targeting — two independent axes that compose:
// { zone: Zone.Hand, owner: Owner.Chosen }. See reactions/choice-filters.ts.
// ---------------------------------------------------------------------------

/** Where cards live. Targeting only — visibility is the projection layer's. */
export enum Zone {
  Hand = "Hand",
  Party = "Party",
  Discard = "Discard",
  EquippedItem = "EquippedItem",
}

/** Whose cards, resolved against the ability owner and the ability context. */
export enum Owner {
  /** The ability owner. */
  Self = "Self",
  /** Everyone except the ability owner. */
  Others = "Others",
  All = "All",
  /** Whoever a preceding ChoosePlayerTask put on CTX_CHOSEN_PLAYER. */
  Chosen = "Chosen",
}

/**
 * WHOSE events an ability listens to. Replaces the processor's old hard-coded
 * passive/active scan split, which could only express two of these and had no
 * way to say "any player's roll" — the expansion's -1 modifier card.
 *
 * Checked in `triggerMatches()`; the switch is exhaustive.
 */
export enum TriggerScope {
  /** The event is ABOUT this card (payload.cardId === source). A hero's own roll. */
  SelfCard = "SelfCard",
  /**
   * The event is about the hero CARRYING this card — an equipped item reacting
   * to its own carrier's roll. payload.cardId is the hero; the item is the
   * source.
   */
  CarrierCard = "CarrierCard",
  /** The event belongs to my owner. "Each time YOU roll to CHALLENGE." */
  OwnerEvent = "OwnerEvent",
  /** Only while it is my owner's turn. */
  OwnerTurn = "OwnerTurn",
  /** Anyone's event — a table-wide passive. */
  Anyone = "Anyone",
}

/**
 * Which standing rule an IEffect is. A rule does nothing until something
 * reads it.
 *   RollBonus     — read by ModifierWindow and ChallengeWindow
 *   CantBeStolen  — read by StealFromPartyTask
 *   CantChallenge, CantBeChallenged — NOT wired; no reader yet.
 */
export enum PassiveType {
  RollBonus = "RollBonus",
  CantBeStolen = "CantBeStolen",
  CantBeChallenged = "CantBeChallenged",
}

export enum ChallengeResult {
  NoChallengeOrWon = "NoChallengeOrWon",
  ChallengerWon = "ChallengerWon",
}

export enum Audience {
  All = "All",
  PlayerOnly = "PlayerOnly",
  Opponents = "Opponents",
}

export enum ActionType {
  DrawCard = "DrawCard",
  RollOnHero = "RollOnHero",
  PlayHero = "PlayHero",
  PlayItem = "PlayItem",
  PlayMagic = "PlayMagic",
  AttackMonster = "AttackMonster",
  ReDraw = "ReDraw",
}

export enum ReactionType {
  ApplyModifier = "ApplyModifier",
  Challenge = "Challenge",
}
