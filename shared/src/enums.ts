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
  /** Pick one number — a modifier card's printed values. */
  ValueChoice = "ValueChoice",
  /** A roll to slay a monster. Modifiable, like Modifier and Challenge. */
  Attack = "Attack",
  /** Pick a monster from the row. Only ones the party may legally attack. */
  MonsterChoice = "MonsterChoice",
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
  /**
   * A card was taken out of one player's hand and into another's, unseen by
   * the taker. Not CardRemovedFromHand: nothing is being played.
   */
  CardPulled = "CardPulled",
  MagicPlayed = "MagicPlayed",
  /** A modifier card was spent. ModifierApplied reports the bonus landing. */
  ModifierPlayed = "ModifierPlayed",
  /**
   * A challenge card was spent. The card's own entry starts the challenge on
   * this; ChallengeStarted then reports the two rolls.
   */
  ChallengePlayed = "ChallengePlayed",

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
  /**
   * An attack roll landed in the monster's fight-back band. `{ cardId }`, and
   * the event's playerId is the attacker; the monster's own entries trigger on
   * it under TriggerScope.Attacker. A MISS emits nothing at all.
   */
  MonsterFoughtBack = "MonsterFoughtBack",
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
  /**
   * A roll to use a hero's effect came up short. `{ cardId }` names the hero.
   * Emitted AFTER the rollback, so what it fires runs on live state — the same
   * shape MonsterFoughtBack uses on a failed attack.
   */
  RollFailed = "RollFailed",

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
  /** The face-up monster row. Shared, like Discard — it belongs to nobody. */
  MonsterPile = "MonsterPile",
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
  /**
   * The event is an attack on this card, and the run belongs to whoever made
   * it. A monster in the monster pile sits in no party, so it has no owner to
   * resolve the other scopes against — the attack names one, and `ownerFor`
   * reads it off the event. That is the whole difference from SelfCard.
   */
  Attacker = "Attacker",
  /** Anyone's event — a table-wide passive. */
  Anyone = "Anyone",
}

/**
 * Which standing rule an IEffect is. A rule does nothing until something
 * reads it.
 *   RollBonus         — read by ModifierWindow, AttackWindow, ChallengeWindow
 *   ActionPointBonus  — read by TurnManager.startTurn
 *   ModifierCounterBonus — read by ModifiableRollWindow and ChallengeWindow
 *   CantBeStolen      — read by StealFromPartyTask
 *   CantBeChallenged  — read by ChallengeWindow, narrowed by IEffect.cardTypes
 *   CantUseHeroEffect — read by RollOnHeroAction and RollOnHeroTask
 */
export enum PassiveType {
  RollBonus = "RollBonus",
  /** Extra action points at the start of the owner's turn. */
  ActionPointBonus = "ActionPointBonus",
  /**
   * Answers a modifier ANOTHER player lands on one of the owner's rolls, with
   * a bonus to that same roll. Read by the windows a modifier is spent into.
   */
  ModifierCounterBonus = "ModifierCounterBonus",
  CantBeStolen = "CantBeStolen",
  CantBeChallenged = "CantBeChallenged",
  /** The equipped hero's effect cannot be rolled for at all. Sealing Key. */
  CantUseHeroEffect = "CantUseHeroEffect",
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
  /** Activating a leader. The only way a leader's ability ever runs. */
  RollOnLeader = "RollOnLeader",
  PlayHero = "PlayHero",
  PlayItem = "PlayItem",
  PlayMagic = "PlayMagic",
  AttackMonster = "AttackMonster",
  ReDraw = "ReDraw",
  /** A pass: forfeits the rest of the budget so the turn ends. */
  EndTurn = "EndTurn",
}

export enum ReactionType {
  ApplyModifier = "ApplyModifier",
  Challenge = "Challenge",
}
