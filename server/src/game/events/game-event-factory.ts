import { Audience, GameEventType, IGameEvent } from 'shared'
import { GameEvent } from './game-event'

export class GameEventFactory {
  // --- Dice ---

  static diceRolled(
    playerId: string,
    heroId: string,
    baseRoll: number,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.DiceRolled,
      playerId,
      { baseRoll, heroId },
      Audience.All,
    )
  }

  // --- Modifier Window ---

  static modifierWindowOpened(
    rollerId: string,
    baseRoll: number,
    rollReq: number,
    heroId: string,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.ModifierWindowOpened,
      rollerId,
      { rollerId, baseRoll, rollReq, heroId },
      Audience.All,
    )
  }

  static modifierApplied(
    playerId: string,
    value: number,
    finalRoll: number,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.ModifierApplied,
      playerId,
      { value, finalRoll },
      Audience.All,
    )
  }

  static modifierWindowClosed(
    rollerId: string,
    finalRoll: number,
    rollReq: number,
    heroId: string,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.ModifierWindowClosed,
      rollerId,
      { finalRoll, rollReq, heroId },
      Audience.All,
    )
  }

  static modifierResolved(
    rollerId: string,
    finalRoll: number,
    rollReq: number,
    heroId: string,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.ModifierResolved,
      rollerId,
      { finalRoll, rollReq, heroId },
      Audience.All,
    )
  }

  // --- Challenge Window ---

  static cardPlayAttempted(playerId: string, cardId: string): IGameEvent {
    return new GameEvent(
      GameEventType.CardPlayAttempted,
      playerId,
      { cardId },
      Audience.All,
    )
  }

  static challengeStarted(
    challengerId: string,
    defenderId: string,
    cardId: string,
    challengerRoll: number,
    defenderRoll: number,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.ChallengeStarted,
      challengerId,
      { challengerId, defenderId, cardId, challengerRoll, defenderRoll },
      Audience.All,
    )
  }

  static modifierAppliedToChallenge(
    playerId: string,
    value: number,
    targetPlayerId: string,
    challengerTotal: number,
    defenderTotal: number,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.ModifierApplied,
      playerId,
      { value, targetPlayerId, challengerTotal, defenderTotal },
      Audience.All,
    )
  }

  static challengeWindowClosed(defenderId: string, cardId: string): IGameEvent {
    return new GameEvent(
      GameEventType.ChallengeWindowClosed,
      defenderId,
      { cardId, challenged: false },
      Audience.All,
    )
  }

  static challengeResolved(
    defenderId: string,
    challengerId: string,
    cardId: string,
    challengerFinal: number,
    defenderFinal: number,
    defenderWins: boolean,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.ChallengeResolved,
      defenderId,
      {
        cardId,
        challengerId,
        defenderId,
        challengerFinal,
        defenderFinal,
        defenderWins,
      },
      Audience.All,
    )
  }

  // --- Cards ---

  static heroAddedToParty(playerId: string, cardId: string): IGameEvent {
    return new GameEvent(
      GameEventType.HeroAddedToParty,
      playerId,
      { cardId },
      Audience.All,
    )
  }

  static itemEquipedToHero(
    playerId: string,
    cardId: string,
    heroId: string,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.ItemEquippedToHero,
      playerId,
      { cardId, heroId },
      Audience.All,
    )
  }

  static magicPlayed(playerId: string, cardId: string): IGameEvent {
    return new GameEvent(
      GameEventType.MagicPlayed,
      playerId,
      { cardId },
      Audience.All,
    )
  }

  static cardRemovedFromHand(playerId: string, cardId: string): IGameEvent {
    return new GameEvent(
      GameEventType.HeroAddedToParty,
      playerId,
      { cardId },
      Audience.All,
    )
  }

  static cardPlayed(playerId: string, cardId: string): IGameEvent {
    return new GameEvent(
      GameEventType.CardPlayed,
      playerId,
      { cardId },
      Audience.All,
    )
  }

  static cardDiscarded(playerId: string, cardId: string): IGameEvent {
    return new GameEvent(
      GameEventType.CardDiscarded,
      playerId,
      { cardId },
      Audience.All,
    )
  }

  static cardDrawn(playerId: string, cardId: string): IGameEvent {
    return new GameEvent(GameEventType.CardDrawn, playerId, { cardId }, Audience.PlayerOnly)
  }

  static rollSuccess(playerId: string, heroId: string): IGameEvent {
    return new GameEvent(
      GameEventType.RollSuccess,
      playerId,
      { cardId: heroId },
      Audience.All,
    )
  }

  static heroStolen(toPlayerId: string, fromPlayerId: string, heroId: string): IGameEvent {
    return new GameEvent(
      GameEventType.HeroStolen,
      toPlayerId,
      { cardId: heroId, fromPlayerId, toPlayerId },
      Audience.All,
    )
  }

  static heroDestroyed(playerId: string, cardId: string): IGameEvent {
    return new GameEvent(
      GameEventType.HeroDestroyed,
      playerId,
      { cardId },
      Audience.All,
    )
  }

  static monsterSlain(playerId: string, cardId: string): IGameEvent {
    return new GameEvent(
      GameEventType.MonsterSlain,
      playerId,
      { cardId },
      Audience.All,
    )
  }

  // --- Reaction Frame ---

  static frameResolved(frameId: string, results: unknown[]): IGameEvent {
    return new GameEvent(
      GameEventType.FrameResolved,
      '',
      { frameId, results },
      Audience.All,
    )
  }

  // --- Challenge Action ---

  static challengeWindowOpened(
    challengerId: string,
    cardId: string,
    targetedCardId: string,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.ChallengeWindowOpened,
      challengerId,
      { challengerId, cardId, targetedCardId },
      Audience.All,
    )
  }
}
