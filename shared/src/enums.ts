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

export enum EffectDuration {
  OneTime = "OneTime",
  TurnEnd = "TurnEnd",
  NextTurn = "NextTurn",
  Passive = "Passive",
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
  MagicPlayed = "MagicPlayed",

  // Hero events
  HeroAddedToParty = "HeroAddedToParty",
  HeroSacrificed = "HeroSacrificed",
  HeroDestroyed = "HeroDestroyed",
  HeroStolen = "HeroStolen",

  // Monster events
  MonsterSlain = "MonsterSlain",
  MonsterFlipped = "MonsterFlipped",

  // Turn events
  TurnStarted = "TurnStarted",
  TurnEnded = "TurnEnded",

  // Item events
  ItemEquippedToHero = "ItemEquippedToHero",

  // Game events
  GameStarted = "GameStarted",
  GameEnded = "GameEnded",
  DiceRolled = "DiceRolled",
  RollSuccess = "RollSuccess",

  // Reaction frame
  FrameResolved = "FrameResolved",

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
// Card targeting — two independent axes, deliberately kept apart.
//
// Zone answers WHICH pile, Owner answers WHOSE. Fusing them (an
// "OpponentHand" member, say) forces a new value for every combination and
// still cannot express "the chosen player's hand", so they stay separate and
// compose: { zone: Zone.Hand, owner: Owner.Chosen }.
// ---------------------------------------------------------------------------

/**
 * Where cards live. Used to say which cards an ability may target — NOT which
 * a given client may see. Visibility belongs to the projection layer in front
 * of the API, since the client never receives the whole GameState anyway.
 */
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

export enum PassiveType {
  RollBonus = "RollBonus",
  CantBeStolen = "CantBeStolen",
  CantChallenge = "CantChallenge",
  CantBeChallenged = "CantBeChallenged",
}

export enum ExpiryCondition {
  EndOfTurn = "EndOfTurn",
  StartOfNextTurn = "StartOfNextTurn",
  Permanent = "Permanent",
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
