import { IGameEventEmitter, ReactionWindowType } from 'shared'
import { ITask } from '../interfaces'
import { GameState } from '../game-state'
import {
  AbilityContext,
  CTX_LAST_AFFECTED_CARD_ID,
  CTX_LAST_DRAWN_CARD_ID,
  CTX_STOLEN_FROM_PLAYER_ID,
} from '../ability-context'
import { GameEventFactory } from '../events/game-event-factory'
import { HeroCard } from '../cards/hero-card'
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
// The pipeline suspends here; if finalRoll >= rollReq ReactionManager emits
// RollSuccess and FrameResolved resumes remaining steps. If the roll fails,
// the snapshot is restored (undoing the steal or any prior mutations).
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
    const baseRoll = Math.ceil(Math.random() * 11) + 1

    em.emit(GameEventFactory.diceRolled(ctx.ownerId, heroId, baseRoll))

    const frameId = rm.openFrame()
    rm.openWindow(frameId, ReactionWindowType.Modifier, ctx.ownerId, {
      rollerId: ctx.ownerId,
      baseRoll,
      rollReq,
      heroId,
    })
  }
}

