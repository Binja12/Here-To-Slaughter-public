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
  Choice = "Choice",
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

  // Game events
  GameStarted = "GameStarted",
  GameEnded = "GameEnded",
  DiceRolled = "DiceRolled",

  // Modifier window
  ModifierWindowOpened = "ModifierWindowOpened",
  ModifierApplied = "ModifierApplied",
  ModifierWindowClosed = "ModifierWindowClosed",
  ModifierResolved = "ModifierResolved",
  // Challenge window
  CardPlayAttempted = "CardPlayAttempted",
  ChallengeWindowOpened = "ChallengeWindowOpened",
  ChallengeStarted = "ChallengeStarted",
  ChallengeWindowClosed = "ChallengeWindowClosed",
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

export enum TargetPlayer {
  Self = "Self",
  Opponent = "Opponent",
  Any = "Any",
}

export enum SelectionMode {
  PlayerChooses = "PlayerChooses",
  OpponentChooses = "OpponentChooses",
  Random = "Random",
}

export enum CardLocation {
  Party = "Party",
  Hand = "Hand",
}

export enum SearchLocation {
  DiscardPile = "DiscardPile",
  OpponentHand = "OpponentHand",
}

export enum PeakTarget {
  OwnDeck = "OwnDeck",
  OpponentDeck = "OpponentDeck",
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
  PlayCard = "PlayCard",
  ApplyModifier = "ApplyModifier",
  Challenge = "Challenge",
}
