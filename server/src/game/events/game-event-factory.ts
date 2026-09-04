import { Audience, GameEventType, IGameEvent, ReactionWindowType } from 'shared'
import { GameEvent } from './game-event'
import {
  CTX_DRAWN_CARD_IDS,
  CTX_MODIFIER_TARGET,
  CTX_CHOSEN_VALUE,
} from '../abilities/ability-context'

export class GameEventFactory {
  // --- Dice ---

  /**
   * The raw die, before any window can move it. `cardId` is what the roll is
   * ABOUT — a hero for `rollOnHero`, a monster for `attackMonster` — under the
   * key every other event names its subject with, so TriggerScope.SelfCard
   * resolves against it like anything else.
   */
  static diceRolled(
    playerId: string,
    cardId: string,
    baseRoll: number,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.DiceRolled,
      playerId,
      { baseRoll, cardId },
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

  /** From TaskChoiceWindow on CONFIRM. `cardId` is the ability's source card. */
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

  /** From CardTypeCondition. `label` is what a continuation matches with `when`. */
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
    /** Standing bonuses each side brings in. */
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

  static itemUnequipped(
    playerId: string,
    cardId: string,
    heroId: string,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.ItemUnequipped,
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
   * spendCard moves the card silently, so this is the only record it was spent.
   *
   * The card's own entry triggers on it and lands the bonus, so the target
   * rides along as `ctxSeed`: that entry runs with a fresh context and the
   * reaction is the only thing that knew whose roll was aimed at.
   */
  static modifierPlayed(
    playerId: string,
    cardId: string,
    targetPlayerId: string,
    value: number,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.ModifierPlayed,
      playerId,
      {
        cardId,
        targetPlayerId,
        value,
        // The card's entry runs with a fresh context: what it needs travels here.
        ctxSeed: {
          [CTX_MODIFIER_TARGET]: [targetPlayerId],
          [CTX_CHOSEN_VALUE]: [value],
        },
      },
      Audience.All,
    )
  }

  /**
   * A challenge card was spent. The card's own entry starts the challenge on
   * this; before it, `PlayChallengeReaction` announced nothing at all and the
   * only record was the window's own ChallengeStarted.
   */
  static challengePlayed(
    playerId: string,
    cardId: string,
    targetedCardId: string,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.ChallengePlayed,
      playerId,
      { cardId, targetedCardId },
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

  /**
   * `playerId` is the player who TOOK it. Audience.All with the card named:
   * events state the full truth and the projection layer in front of the API
   * decides who may see which id (§5).
   */
  /** RetrieveCardTask: `playerId` is the hand the card landed in. */
  /** TradeHandsTask: `playerId`'s whole hand and `withPlayerId`'s changed places. */
  static handsTraded(playerId: string, withPlayerId: string): IGameEvent {
    return new GameEvent(
      GameEventType.HandsTraded,
      playerId,
      { withPlayerId },
      Audience.All,
    )
  }

  static cardRetrieved(
    playerId: string,
    cardId: string,
    from: 'Discard' | 'Equipment',
  ): IGameEvent {
    return new GameEvent(
      GameEventType.CardRetrieved,
      playerId,
      { cardId, from },
      Audience.All,
    )
  }

  /**
   * ForEachPlayerTask, once per seat: `cardId` is the card acting (SelfCard
   * matches it), `ctxSeed` carries the targeted seat as CTX_CHOSEN_PLAYER.
   */
  static playerTargeted(
    playerId: string,
    sourceCardId: string,
    label: string,
    ctxSeed: Record<string, unknown>,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.PlayerTargeted,
      playerId,
      { cardId: sourceCardId, label, ctxSeed },
      Audience.All,
    )
  }

  /** RevealTask: `playerId` is who sees them; `toAll` when the table does. */
  static cardsRevealed(
    playerId: string,
    cardIds: string[],
    toAll: boolean,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.CardsRevealed,
      playerId,
      { cardIds, toAll },
      Audience.All,
    )
  }

  static revealEnded(playerId: string, cardIds: string[]): IGameEvent {
    return new GameEvent(
      GameEventType.RevealEnded,
      playerId,
      { cardIds },
      Audience.All,
    )
  }

  static cardPulled(
    toPlayerId: string,
    fromPlayerId: string,
    cardId: string,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.CardPulled,
      toPlayerId,
      { cardId, fromPlayerId, toPlayerId },
      Audience.All,
    )
  }

  /**
   * `ctxSeed` for the same reason ModifierPlayed carries one: an entry
   * TRIGGERED by a draw runs with a fresh context, so without it a card like
   * Orthus could not tell WHICH card was drawn. A card that draws for itself
   * (Snowball) gets the slot from its own DrawTask and ignores this.
   */
  static cardDrawn(playerId: string, cardId: string): IGameEvent {
    return new GameEvent(
      GameEventType.CardDrawn,
      playerId,
      { cardId, ctxSeed: { [CTX_DRAWN_CARD_IDS]: [cardId] } },
      Audience.PlayerOnly,
    )
  }

  /** RollOnLeaderAction: the leader's ability fires. `cardId` is the leader, for SelfCard. */
  static leaderActivated(playerId: string, leaderId: string): IGameEvent {
    return new GameEvent(
      GameEventType.LeaderActivated,
      playerId,
      { cardId: leaderId },
      Audience.All,
    )
  }

  static rollSuccess(playerId: string, heroId: string): IGameEvent {
    return new GameEvent(
      GameEventType.RollSuccess,
      playerId,
      { cardId: heroId },
      Audience.All,
    )
  }

  /**
   * The roll came up short. Emitted after the rollback, so anything it fires
   * runs on live state rather than being undone with the frame — see
   * MonsterFoughtBack, which is the same shape on the attack path.
   */
  static rollFailed(playerId: string, heroId: string): IGameEvent {
    return new GameEvent(
      GameEventType.RollFailed,
      playerId,
      { cardId: heroId },
      Audience.All,
    )
  }

  static heroStolen(
    toPlayerId: string,
    fromPlayerId: string,
    heroId: string,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.HeroStolen,
      toPlayerId,
      { cardId: heroId, fromPlayerId, toPlayerId },
      Audience.All,
    )
  }

  /**
   * A hero was given up by its own owner — a price a card charged, not a
   * removal somebody else caused. `Party.removeHero` announces the canonical
   * HeroRemovedFromParty alongside it, which is what expiries subscribe to.
   */
  static heroSacrificed(playerId: string, cardId: string): IGameEvent {
    return new GameEvent(
      GameEventType.HeroSacrificed,
      playerId,
      { cardId },
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

  /**
   * An attack landed in the fight-back band. `playerId` is the ATTACKER, which
   * is what TriggerScope.Attacker reads to own the monster's run — the monster
   * is still in the pile and belongs to nobody.
   */
  static monsterFoughtBack(playerId: string, cardId: string): IGameEvent {
    return new GameEvent(
      GameEventType.MonsterFoughtBack,
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

  /**
   * Emitted by TaskManager.announceIfCardIsDone as a pipeline leaves the stack.
   * PlayerOnly: nothing off-server acts on it, and Audience has no server-only
   * member.
   */
  static abilityDone(ownerId: string, cardId: string): IGameEvent {
    return new GameEvent(
      GameEventType.AbilityDone,
      ownerId,
      { cardId },
      Audience.PlayerOnly,
    )
  }

  // --- Reaction Frame ---

  /**
   * `results` is the log transport, always an array. `result` is the optional
   * context write — the window names both slot and value (resultKey).
   */
  /**
   * `cardId` names what the frame was over, for windows that settle on one.
   * The frame is deleted before this goes out, so the event is the only place
   * left to read it — a played card's entry triggers on exactly this.
   */
  static frameResolved(
    frameId: string,
    results: unknown[],
    result?: { key: string; value: unknown },
    cardId?: string,
  ): IGameEvent {
    return new GameEvent(
      GameEventType.FrameResolved,
      '',
      { frameId, results, result, cardId },
      Audience.All,
    )
  }

  // --- Reaction Windows (generic lifecycle) ---

  /**
   * The one lifecycle event every reaction window emits; consumers switch on
   * payload windowType. `options` is the candidate list, `detail` whatever
   * that window kind needs to render. Carries every candidate — the projection
   * layer in front of the API decides who sees what.
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
