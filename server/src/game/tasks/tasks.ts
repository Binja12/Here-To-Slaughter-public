import { IGameEventEmitter } from 'shared'
import { ITask } from '../interfaces'
import { GameState } from '../game-state'
import { AbilityContext, CTX_LAST_DRAWN_CARD_ID } from '../ability-context'
import { GameEventFactory } from '../events/game-event-factory'

// ---------------------------------------------------------------------------
// DrawTask — draw N cards from the main deck into the owner's hand
//
// Each card drawn is emitted immediately so listeners react before the next
// draw happens (e.g. a passive that triggers on CardDrawn sees each card).
// ---------------------------------------------------------------------------

export class DrawTask implements ITask {
  constructor(private count: number) {}

  execute(gs: GameState, ctx: AbilityContext, em: IGameEventEmitter): void {
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
//
// If an explicit cardId is provided, that card is discarded.
// Otherwise, ctx.sourceCardId (the card whose ability is running) is used.
// ---------------------------------------------------------------------------

export class DiscardTask implements ITask {
  constructor(private readonly cardId?: string) {}

  execute(gs: GameState, ctx: AbilityContext, em: IGameEventEmitter): void {
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
//
// If an explicit heroId is provided, that hero is destroyed.
// Otherwise, ctx.sourceCardId is used.
// ---------------------------------------------------------------------------

export class DestroyTask implements ITask {
  constructor(private readonly heroId?: string) {}

  execute(gs: GameState, ctx: AbilityContext, em: IGameEventEmitter): void {
    const targetId = this.heroId ?? ctx.sourceCardId
    const party = gs.getParty(ctx.ownerId)
    if (!party.getHeroIds().includes(targetId)) return

    party.removeHero(targetId)
    gs.getDiscardPile().add(targetId)
    em.emit(GameEventFactory.heroDestroyed(ctx.ownerId, targetId))
  }
}
