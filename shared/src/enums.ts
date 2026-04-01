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
}

export enum EffectDuration {
  TurnEnd = "TurnEnd",
  RoundEnd = "RoundEnd",
  Permanent = "Permanent",
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
