import { IGameEventEmitter, ReactionWindowType, RollResult } from 'shared'
import { ITask } from '../interfaces'
import { GameState } from '../game-state'
import {
  AbilityContext,
  CTX_FRAME_RESULTS,
  CTX_LAST_AFFECTED_CARD_ID,
  CTX_LAST_DRAWN_CARD_ID,
  CTX_STOLEN_FROM_PLAYER_ID,
} from '../ability-context'
import { GameEventFactory } from '../events/game-event-factory'
import { HeroCard } from '../cards/hero-card'
import { MonsterCard } from '../cards/monster-card'
import type { ReactionManager } from '../reactions/reaction-manager'

// ---------------------------------------------------------------------------
// DrawTask — draw N cards from the main deck into the owner's hand
// ---------------------------------------------------------------------------

export class DrawTask implements ITask {
  constructor(private count: number) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: ReactionManager,
  ): void {
    const player = gs.getPlayer(ctx.ownerId)
    if (!player) return

    for (let i = 0; i < this.count; i++) {
      const cardId = gs.getMainDeck().draw()
      if (!cardId) break
      player.addToHand(cardId)
      ctx.set(CTX_LAST_DRAWN_CARD_ID, cardId)
      em.emit(GameEventFactory.cardDrawn(ctx.ownerId, cardId))
    }
  }
}

// ---------------------------------------------------------------------------
// DiscardTask — remove a card from the owner's hand to the discard pile
// ---------------------------------------------------------------------------

export class DiscardTask implements ITask {
  constructor(private readonly cardId?: string) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: ReactionManager,
  ): void {
    const targetId = this.cardId ?? ctx.sourceCardId
    const player = gs.getPlayer(ctx.ownerId)
    if (!player) return
    if (!player.getHand().includes(targetId)) return

    player.removeFromHand(targetId)
    gs.getDiscardPile().add(targetId)
    em.emit(GameEventFactory.cardDiscarded(ctx.ownerId, targetId))
  }
}

// ---------------------------------------------------------------------------
// DestroyTask — remove a hero from the owner's party to the discard pile
// ---------------------------------------------------------------------------

export class DestroyTask implements ITask {
  constructor(private readonly heroId?: string) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: ReactionManager,
  ): void {
    const targetId = this.heroId ?? ctx.sourceCardId
    const party = gs.getParty(ctx.ownerId)
    if (!party.getHeroIds().includes(targetId)) return

    party.removeHero(targetId)
    gs.getDiscardPile().add(targetId)
    em.emit(GameEventFactory.heroDestroyed(ctx.ownerId, targetId))
  }
}

// ---------------------------------------------------------------------------
// StealHeroTask — move a hero from another player's party to the owner's party
// ---------------------------------------------------------------------------

export class StealHeroTask implements ITask {
  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: ReactionManager,
  ): void {
    const heroId = ctx.get<string>(CTX_LAST_AFFECTED_CARD_ID)
    if (!heroId) return

    const fromPlayerId = gs.getCardOwner(heroId)
    if (!fromPlayerId || fromPlayerId === ctx.ownerId) return

    const fromParty = gs.getParty(fromPlayerId)
    if (!fromParty.getHeroIds().includes(heroId)) return

    fromParty.removeHero(heroId)
    gs.getParty(ctx.ownerId).addHero(heroId)
    ctx.set(CTX_STOLEN_FROM_PLAYER_ID, fromPlayerId)
    em.emit(GameEventFactory.heroStolen(ctx.ownerId, fromPlayerId, heroId))
  }
}

// ---------------------------------------------------------------------------
// RollOnHeroTask — roll dice on a hero and open a modifier window.
//
// Emits DiceRolled then opens a modifier-window frame (which snapshots GS).
// The pipeline suspends here (AbilityProcessor sees _lastFrameId and stores
// remaining steps in abilityPipelines). On FrameResolved, AbilityProcessor
// resumes the remaining steps — which should include HeroRollOutcomeTask.
// If the roll fails, restoreFrame wipes the pipeline entry so no outcome
// task runs.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// FightBackTask — placeholder executed when a monster fights back after a
// failed attack. Concrete effect is defined per-monster via card data steps.
// ---------------------------------------------------------------------------

export class FightBackTask implements ITask {
  execute(
    _gs: GameState,
    _ctx: AbilityContext,
    _em: IGameEventEmitter,
    _rm: ReactionManager,
  ): void {
    // Effect defined by the specific monster card's ability steps.
  }
}

// ---------------------------------------------------------------------------
// HeroRollOutcomeTask — runs after FrameResolved from a hero modifier window.
//
// Only executed when the frame was RELEASED (success path). When the frame is
// RESTORED (finalRoll < rollReq), restoreFrame wipes abilityPipelines from
// the snapshot so this task is never reached.
//
// Emits RollSuccess so AbilityProcessor can fire the hero's ability steps.
// ---------------------------------------------------------------------------

export class HeroRollOutcomeTask implements ITask {
  execute(
    _gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: ReactionManager,
  ): void {
    const heroId = ctx.get<string>(CTX_LAST_AFFECTED_CARD_ID)
    if (!heroId) return
    em.emit(GameEventFactory.rollSuccess(ctx.ownerId, heroId))
  }
}

// ---------------------------------------------------------------------------
// MonsterAttackOutcomeTask — runs after FrameResolved from a monster modifier window.
//
// Reads finalRoll from CTX_FRAME_RESULTS, calls card.trySlay(), then:
//   Slay     → remove from monster pile, add to attacker's party, draw from deck
//   Miss     → nothing
//   FightBack → emit MonsterAttackFail so AbilityProcessor fires fightback steps
// ---------------------------------------------------------------------------

export class MonsterAttackOutcomeTask implements ITask {
  constructor(private readonly monsterId: string, private readonly attackerId: string) {}

  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    _rm: ReactionManager,
  ): void {
    const results = ctx.get<number[]>(CTX_FRAME_RESULTS)
    const finalRoll = results?.[0]
    if (finalRoll === undefined) return

    const card = gs.getCard(this.monsterId)
    if (!(card instanceof MonsterCard)) return

    const result = card.trySlay(finalRoll)

    if (result === RollResult.Slay) {
      gs.getMonsterPile().pick(this.monsterId)
      gs.getParty(this.attackerId).addMonster(this.monsterId)

      const nextMonsterId = gs.getMonsterDeck().draw()
      if (nextMonsterId) gs.getMonsterPile().add(nextMonsterId)

      em.emit(GameEventFactory.monsterSlain(this.attackerId, this.monsterId))
    } else if (result === RollResult.FightBack) {
      em.emit(GameEventFactory.monsterAttackFail(this.attackerId, this.monsterId))
    }
    // Miss → nothing
  }
}

// ---------------------------------------------------------------------------
export class RollOnHeroTask implements ITask {
  execute(
    gs: GameState,
    ctx: AbilityContext,
    em: IGameEventEmitter,
    rm: ReactionManager,
  ): void {
    const heroId = ctx.get<string>(CTX_LAST_AFFECTED_CARD_ID)
    if (!heroId) return

    const hero = gs.getCard(heroId)
    if (!(hero instanceof HeroCard)) return

    const rollReq = hero.getRollReq()
    const baseRoll = Math.floor(Math.random() * 11) + 1

    em.emit(GameEventFactory.diceRolled(ctx.ownerId, heroId, baseRoll))

    // Mark ability used before the snapshot so rollback doesn't undo it —
    // the hero's ability slot is consumed whether the roll succeeds or fails.
    gs.markAbilityUsed(heroId)

    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.Modifier, ctx.ownerId, {
      rollerId: ctx.ownerId,
      baseRoll,
      rollReq,
      heroId,
    })
  }
}

