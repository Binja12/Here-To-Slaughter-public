import { CardType, GameEventType, HeroClass, IGameEvent, ReactionWindowType } from 'shared'
import { GameState } from '../../pipelines/game-state'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { HeroCard } from '../../cards/hero-card'
import { ItemCard } from '../../cards/item-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { AbilityContext, CTX_CHOSEN_CARD, CTX_CHOSEN_PLAYER } from '../../abilities/ability-context'
import { IReactionWindow } from '../../interfaces'

const makeGs = (deck: string[] = []) => {
  const main = new CardStack('deck', 'main')
  for (const id of deck) main.addToBottom(id)
  return new GameState(main, new CardPile('discard', 'discard'), new CardStack('mdeck', 'monster-deck'), new CardPile('mpile', 'monster-pile'))
}

const seat = (gs: GameState, id: string, hand: string[] = [], heroIds: string[] = []) => {
  gs.registerPlayer(new Player({ id, name: id, hand, partyId: `${id}-party`, actionPoints: 3 }))
  gs.registerParty(new Party({ playerId: id, leaderId: `${id}-leader`, heroIds, monsterIds: [] }))
}

const hero = (id: string, heroClass = HeroClass.Thief) =>
  new HeroCard({ id, name: id, type: CardType.Hero, image: '', description: '', set: 'base', heroClass, rollReq: 5 })

const item = (id: string, cursed = false) =>
  new ItemCard({ id, name: id, type: CardType.Item, image: '', description: '', set: 'base', cursed })

const openWindow = (gs: GameState): IReactionWindow =>
  [...gs.frames.values()].flatMap((f) => f.windows).find((w) => w.isOpen())!

/** Answers the open window the way the player would, in the slot it names. */
const answer = (gs: GameState, ctx: AbilityContext, pick?: string) => {
  const window = openWindow(gs)
  ctx.set(window.resultKey() as string, pick === undefined ? [] : [pick])
  window.resolve()
  return window
}

const wire = (gs: GameState) => {
  const em = new GameEventEmitter()
  const emitted: IGameEvent[] = []
  em.addListener({ onEvent: (e) => emitted.push(e) })
  return { em, emitted, rm: new ReactionManager(gs, em) }
}
import { BearyWiseAbility } from './beary-wise-ability'
import { CTX_DISCARDED_COUNT } from '../../abilities/ability-context'
import { TaskManager } from '../../pipelines/task-manager'
import { GameEventFactory } from '../../events/game-event-factory'

// Beary Wise (hero-003): "Each other player must DISCARD a card. Choose one
// of the discarded cards and add it to your hand."

describe('Beary Wise (hero-003)', () => {
  it('the per-seat entry: the targeted seat discards a card of their own', () => {
    const gs = makeGs()
    seat(gs, 'p1', ['mine'])
    seat(gs, 'p2', ['a', 'b'])
    const ctx = new AbilityContext('hero-003', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])
    const { em, rm } = wire(gs)
    const [choose, discard] = BearyWiseAbility[1].steps
    choose.execute(gs, ctx, em, rm)
    expect(openWindow(gs).getRespondentId()).toBe('p2')
    answer(gs, ctx, 'b')
    discard.execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p2')!.getHand()).toEqual(['a'])
    expect(gs.getDiscardPile().getAll()).toEqual(['b'])
  })

  it('the owner chooses among exactly what landed on the pile during the loop, and takes it to hand', () => {
    const gs = makeGs()
    gs.getDiscardPile().add('old') // there before — not on offer
    seat(gs, 'p1', ['mine'])
    seat(gs, 'p2', ['a'])
    seat(gs, 'p3', ['b'])
    for (const id of ['old', 'a', 'b', 'mine']) gs.registerCard(hero(id))
    const ctx = new AbilityContext('hero-003', 'p1')
    const { em, emitted, rm } = wire(gs)
    const [mark, loop, count, choose, retrieve] = BearyWiseAbility[0].steps

    mark.execute(gs, ctx, em, rm)
    loop.execute(gs, ctx, em, rm)
    const targeted = emitted.filter((e) => e.getType() === GameEventType.PlayerTargeted)
    expect(targeted.map((e) => (e.getPayload() as { ctxSeed: Record<string, string[]> }).ctxSeed[CTX_CHOSEN_PLAYER])).toEqual([['p3'], ['p2']])
    // the per-seat runs, as the stack would drain them
    for (const seatId of ['p2', 'p3']) {
      const seatCtx = new AbilityContext('hero-003', 'p1')
      seatCtx.set(CTX_CHOSEN_PLAYER, [seatId])
      const [c, d] = BearyWiseAbility[1].steps
      c.execute(gs, seatCtx, em, rm)
      answer(gs, seatCtx, gs.getPlayer(seatId)!.getHand()[0])
      d.execute(gs, seatCtx, em, rm)
    }
    expect(gs.getDiscardPile().getAll()).toEqual(['b', 'a', 'old'])

    count.execute(gs, ctx, em, rm)
    expect(ctx.get(CTX_DISCARDED_COUNT)).toBe(2)
    choose.execute(gs, ctx, em, rm)
    const window = openWindow(gs)
    expect(window.getType()).toBe(ReactionWindowType.CardChoice)
    expect(window.getRespondentId()).toBe('p1')
    expect(window.getOptions()).toEqual(['b', 'a'])
    answer(gs, ctx, 'a')
    retrieve.execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['mine', 'a'])
    expect(gs.getDiscardPile().getAll()).toEqual(['b', 'old'])
    expect(emitted.some((e) => e.getType() === GameEventType.CardRetrieved)).toBe(true)
  })

  it('nobody able to discard: the count is zero, the choice has no options, nothing is taken', () => {
    const gs = makeGs()
    gs.getDiscardPile().add('old')
    seat(gs, 'p1', ['mine'])
    seat(gs, 'p2', [])
    const ctx = new AbilityContext('hero-003', 'p1')
    const { em, rm } = wire(gs)
    const [mark, , count, choose, retrieve] = BearyWiseAbility[0].steps
    mark.execute(gs, ctx, em, rm)
    count.execute(gs, ctx, em, rm)
    expect(ctx.get(CTX_DISCARDED_COUNT)).toBe(0)
    choose.execute(gs, ctx, em, rm)
    expect(openWindow(gs).getOptions()).toEqual([])
    answer(gs, ctx)
    retrieve.execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['mine'])
  })

  it('through the TaskManager: the seats discard in order, THEN the owner is offered exactly those and takes one', () => {
    const gs = makeGs()
    gs.getDiscardPile().add('old')
    seat(gs, 'p1', ['mine'], ['hero-003'])
    seat(gs, 'p2', ['a'])
    seat(gs, 'p3', ['b'])
    gs.registerCard(hero('hero-003'))
    for (const id of ['old', 'a', 'b', 'mine']) gs.registerCard(hero(id))
    const em = new GameEventEmitter()
    const emitted: IGameEvent[] = []
    em.addListener({ onEvent: (e) => emitted.push(e) })
    const rm = new ReactionManager(gs, em)
    new TaskManager(gs, em, rm, new Map([['hero-003', BearyWiseAbility]]))

    em.emit(GameEventFactory.rollSuccess('p1', 'hero-003'))

    const asked: string[] = []
    for (let guard = 0; guard < 5; guard++) {
      const window = openWindow(gs)
      if (!window) break
      asked.push(window.getRespondentId())
      window.submitReaction(window.getRespondentId(), { choice: window.getOptions()[0] })
    }
    // p2 and p3 each discarded before p1 was asked; p1 saw only the two fresh cards
    expect(asked).toEqual(['p2', 'p3', 'p1'])
    expect(gs.getPlayer('p2')!.getHand()).toEqual([])
    expect(gs.getPlayer('p3')!.getHand()).toEqual([])
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['mine', 'b']) // the top of the pile was p3's
    expect(gs.getDiscardPile().getAll()).toEqual(['a', 'old'])
    expect(emitted.filter((e) => e.getType() === GameEventType.CardDiscarded)).toHaveLength(2)
    expect(emitted.filter((e) => e.getType() === GameEventType.CardRetrieved)).toHaveLength(1)
  })
})
