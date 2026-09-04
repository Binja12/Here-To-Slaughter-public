export type CardType =
  | 'Hero'
  | 'Item'
  | 'Magic'
  | 'Modifier'
  | 'Challenge'
  | 'Monster'
  | 'Leader'

export type HeroClass =
  | 'Fighter'
  | 'Guardian'
  | 'Ranger'
  | 'Thief'
  | 'Wizard'
  | 'Bard'

export type ReactionWindowType =
  | 'Challenge'
  | 'Modifier'
  | 'Attack'
  | 'PlayerChoice'
  | 'CardChoice'
  | 'MonsterChoice'
  | 'TaskChoice'
  | 'ValueChoice'

export type GamePhase = 'Setup' | 'Turns' | 'Concluded'

export type RollCompareMode = 'HighToWin' | 'LowToWin'

export type PassiveType =
  | 'RollBonus'
  | 'ActionPointBonus'
  | 'ModifierCounterBonus'
  | 'CantBeStolen'
  | 'CantBeDestroyed'
  | 'StealsInsteadOfDestroy'
  | 'TakesTheHit'
  | 'CantBeChallenged'
  | 'CantUseHeroEffect'

export enum RefusalReason {
  GameOver = 'GameOver',
  NotYourTurn = 'NotYourTurn',
  Busy = 'Busy',
  NoActionPoints = 'NoActionPoints',
  CardNotInHand = 'CardNotInHand',
  HandFull = 'HandFull',
  DeckEmpty = 'DeckEmpty',
  HeroNotInParty = 'HeroNotInParty',
  NotYourLeader = 'NotYourLeader',
  /** the leader in the slot carries a passive; there is nothing to activate */
  LeaderNotActivatable = 'LeaderNotActivatable',
  AbilityAlreadyUsed = 'AbilityAlreadyUsed',
  HeroEffectSealed = 'HeroEffectSealed',
  NotAnItem = 'NotAnItem',
  NotAHero = 'NotAHero',
  HeroAlreadyEquipped = 'HeroAlreadyEquipped',
  MonsterNotInRow = 'MonsterNotInRow',
  PartyRequirementUnmet = 'PartyRequirementUnmet',
  AlreadyChallengedThisTurn = 'AlreadyChallengedThisTurn',
  NoChallengeWindow = 'NoChallengeWindow',
  ChallengeAlreadyStarted = 'ChallengeAlreadyStarted',
  ChallengeNotStarted = 'ChallengeNotStarted',
  /** the defender reaching for a challenge card against their own play */
  CannotChallengeOwnCard = 'CannotChallengeOwnCard',
  NoModifiableWindow = 'NoModifiableWindow',
  TargetNotRolling = 'TargetNotRolling',
  TargetNotInChallenge = 'TargetNotInChallenge',
  NotAModifier = 'NotAModifier',
  ValueNotOnCard = 'ValueNotOnCard',
  NoSuchWindow = 'NoSuchWindow',
  /** PassWindow on a choice: one player's question is answered, never passed */
  WindowNotPassable = 'WindowNotPassable',
  WrongRespondent = 'WrongRespondent',
  NotAnOption = 'NotAnOption',
  /** LeaveGame on a table that is still live — the game server's own guard. */
  GameNotOver = 'GameNotOver',
}
