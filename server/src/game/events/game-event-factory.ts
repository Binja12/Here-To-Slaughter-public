import {
  Audience,
  GameEventType,
  IGameEvent,
  ReactionWindowType,
} from 'shared'
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

  /**
   * Emitted by TaskChoiceWindow on CONFIRM only. The `cardId` is the ability's
   * SOURCE card, so TriggerScope.SelfCard routes the continuation back to the
   * card that asked — the same match a hero's own RollSuccess uses.
   */
  static taskConfirmed(
    playerId: string,
    sourceCardId: string,
    label: string,
    ctxSeed?: Record<string, unknown>,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.TaskConfirmed,
      playerId,
      { cardId: sourceCardId, label, ctxSeed },
      Audience.All,
    )
  }

  /**
   * A condition held. `label` is what a continuation entry matches with
   * `when`; `ctxSeed` carries the slots it will need, since it runs with a
   * fresh context. Nothing is emitted when the condition fails.
   */
  static conditionMet(
    playerId: string,
    sourceCardId: string,
    label: string,
    ctxSeed?: Record<string, unknown>,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.ConditionMet,
      playerId,
      { cardId: sourceCardId, label, ctxSeed },
      Audience.All,
    )
  }

  static challengeStarted(
    challengerId: string,
    defenderId: string,
    cardId: string,
    challengerRoll: number,
    defenderRoll: number,
    /** Standing bonuses each side brings in, so the opening totals are real. */
    challengerBonuses: unknown[] = [],
    defenderBonuses: unknown[] = [],
  ): IGameEvent {
    return new GameEvent(
      GameEventType.ChallengeStarted,
      challengerId,
      {
        challengerId,
        defenderId,
        cardId,
        challengerRoll,
        defenderRoll,
        challengerBonuses,
        defenderBonuses,
      },
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

  /**
   * Canonical "a hero entered a party" — emitted by Party.addHero, the only way
   * in. `reason` discriminates the mechanic that put it there, so a listener
   * that only cares that a hero entered play subscribes once.
   */
  static heroAddedToParty(
    playerId: string,
    cardId: string,
    reason: string,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.HeroAddedToParty,
      playerId,
      { cardId, playerId, reason },
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

  /**
   * A modifier card was spent into an open window. `burnCard` moves it silently
   * (hand and discard, in live state and in the snapshot), so without this the
   * card's departure could only be inferred from the bonus that followed.
   */
  static modifierPlayed(
    playerId: string,
    cardId: string,
    value: number,
    targetPlayerId: string,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.ModifierPlayed,
      playerId,
      { cardId, value, targetPlayerId },
      Audience.All,
    )
  }

  static cardRemovedFromHand(playerId: string, cardId: string): IGameEvent {
    return new GameEvent(
      GameEventType.CardRemovedFromHand,
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

  /**
   * Canonical removal event — emitted by Party.removeHero, the only way out.
   * `playerId` is the party the hero LEFT; `reason` discriminates the mechanic.
   */
  static heroRemovedFromParty(
    playerId: string,
    cardId: string,
    reason: string,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.HeroRemovedFromParty,
      playerId,
      { cardId, playerId, reason },
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

  // --- Ongoing effects ---

  /**
   * An ability installed a standing effect. The client needs this to render
   * state no card face shows ("your heroes are protected this round"), and it
   * gives the sweep's removal something to pair with in the log.
   */
  static effectApplied(
    ownerId: string,
    effectId: string,
    sourceCardId: string,
    detail?: Record<string, unknown>,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.EffectApplied,
      ownerId,
      { effectId, sourceCardId, ...detail },
      Audience.All,
    )
  }

  static effectExpired(
    ownerId: string,
    effectId: string,
    sourceCardId: string,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.EffectExpired,
      ownerId,
      { effectId, sourceCardId },
      Audience.All,
    )
  }

  // --- Reaction Frame ---

  /**
   * `results` is the uniform transport for the event log — always an array,
   * whatever the window produced.
   *
   * `result` is the optional context write: the window names both the slot and
   * the value, so it owns the SHAPE too. A choice reports an array (it may be
   * multi-select); a roll reports a plain number, because there is only ever
   * one final roll. Omitted when the outcome is not an ability input.
   */
  static frameResolved(
    frameId: string,
    results: unknown[],
    result?: { key: string; value: unknown },
  ): IGameEvent {
    return new GameEvent(
      GameEventType.FrameResolved,
      '',
      { frameId, results, result },
      Audience.All,
    )
  }

  // --- Reaction Windows (generic lifecycle) ---

  /**
   * The ONE lifecycle event every reaction window emits. Consumers switch on
   * payload windowType (or call window.getType()) instead of subscribing to a
   * different event per window kind.
   *
   * `options` is the discrete candidate list, omitted by windows that offer
   * none. `detail` carries whatever else that window kind needs to render —
   * the roll and requirement for a modifier, the contested card for a
   * challenge.
   *
   * Windows still emit true domain events (ModifierApplied, ChallengeStarted,
   * ChallengeResolved) for things that are not window lifecycle.
   *
   * Carries every candidate. Deciding which of them a given client may see is
   * the projection layer's job in front of the API; the engine states what is
   * true and does not tailor events per recipient.
   */
  static reactionWindowOpened(
    windowType: ReactionWindowType,
    respondentId: string,
    frameId: string,
    options?: unknown[],
    detail?: Record<string, unknown>,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.ReactionWindowOpened,
      respondentId,
      { windowType, respondentId, frameId, options, ...detail },
      Audience.All,
    )
  }

  /**
   * `outcome` is whatever settled the window — the picked option(s), the final
   * roll, whether the challenged player won.
   */
  static reactionWindowClosed(
    windowType: ReactionWindowType,
    respondentId: string,
    frameId: string,
    outcome?: unknown,
    detail?: Record<string, unknown>,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.ReactionWindowClosed,
      respondentId,
      { windowType, respondentId, frameId, outcome, ...detail },
      Audience.All,
    )
  }

}
