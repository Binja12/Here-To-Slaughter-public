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
  /**
   * A card left a hand to be played. Distinct from CardDiscarded (it is not
   * going to the pile) and from HeroAddedToParty (that announces the ARRIVAL,
   * and only for heroes) — every play type passes through this one first.
   */
  CardRemovedFromHand = "CardRemovedFromHand",
  MagicPlayed = "MagicPlayed",
  /**
   * A modifier card was SPENT into an open window. Distinct from
   * ModifierApplied, which the window emits once the bonus is in the running
   * total — this one says the card left the player's hand for it.
   */
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

  // Game events
  GameStarted = "GameStarted",
  GameEnded = "GameEnded",
  DiceRolled = "DiceRolled",
  RollSuccess = "RollSuccess",

  // Ongoing effects — installed by an ability, removed when their lifetime ends
  EffectApplied = "EffectApplied",
  EffectExpired = "EffectExpired",

  // Reaction frame
  FrameResolved = "FrameResolved",

  /**
   * A player said YES to a ConfirmTask. Carries which question was answered
   * (`confirms`), an optional `seq` when a card asks the same question more
   * than once, and an optional `ctxSeed` of context slots for the continuation.
   *
   * This is how an ability continues past a confirm: the confirm is the LAST
   * step of its entry, and the follow-up is a separate registry entry triggered
   * by this event. DISMISS emits nothing at all — "no" is the absence of the
   * event, so nothing has to be cancelled.
   */
  TaskConfirmed = "TaskConfirmed",

  /**
   * A condition step held. Carries the `label` its declaration gave it, and a
   * `ctxSeed` of the slots the continuation needs.
   *
   * Same shape as TaskConfirmed, for the same reason: the steps a condition
   * guards live in their own registry entry triggered by this event, rather
   * than nested inside the condition. A condition that does NOT hold emits
   * nothing, so "false" is the absence of the event — nothing to skip over.
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
  /** The event belongs to my owner. "Each time YOU roll to CHALLENGE." */
  OwnerEvent = "OwnerEvent",
  /** Only while it is my owner's turn. */
  OwnerTurn = "OwnerTurn",
  /** Anyone's event — a table-wide passive. */
  Anyone = "Anyone",
}

/**
 * Standing rule flags an ActiveEffect can carry. A flag is only real once some
 * rule READS it — declaring one changes nothing on its own, and an effect
 * carrying an unread flag installs, emits EffectApplied and expires on schedule
 * while the rule it names quietly does not apply.
 *
 * Wired today:
 *   RollBonus     — summed into every roll (both reaction windows)
 *   CantBeStolen  — checked in StealFromPartyTask, at the mutation
 *
 * NOT wired yet — no reader exists, and none will be added until a card that
 * needs the effect is implemented:=
 *   CantBeChallenged  — would gate the same, on the card's owner
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
