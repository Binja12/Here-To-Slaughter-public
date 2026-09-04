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
  [...gs.getFrames().values()].flatMap((f) => f.windows).find((w) => w.isOpen())!

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
import { ShurikittyAbility } from './shurikitty-ability'
import { CTX_DESTROYED_HERO_ITEM } from '../../abilities/ability-context'

// Shurikitty (hero-023): "DESTROY a Hero card. If that Hero card had an Item
// card equipped to it, add that Item card to your hand instead of moving it
// to the discard pile."

describe('Shurikitty (hero-023)', () => {
  it('the destroyed hero\'s gear ends in the owner\'s hand, not on the pile, and no discard is announced for it', () => {
    const gs = makeGs()
    seat(gs, 'p1', [], ['mine'])
    seat(gs, 'p2', [], ['h2'])
    gs.registerCard(hero('mine'))
    gs.registerCard(hero('h2'))
    gs.registerCard(item('sword'))
    gs.equipItem('h2', 'sword')
    const ctx = new AbilityContext('hero-023', 'p1')
    const { em, emitted, rm } = wire(gs)
    const [choose, destroy, retrieve] = ShurikittyAbility[0].steps

    choose.execute(gs, ctx, em, rm)
    expect(openWindow(gs).getOptions()).toEqual(expect.arrayContaining(['mine', 'h2']))
    answer(gs, ctx, 'h2')
    destroy.execute(gs, ctx, em, rm)
    expect(ctx.get(CTX_DESTROYED_HERO_ITEM)).toEqual(['sword'])
    retrieve.execute(gs, ctx, em, rm)

    expect(gs.getParty('p2').getHeroIds()).toEqual([])
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['sword'])
    expect(gs.getDiscardPile().getAll()).toEqual(['h2'])
    const types = emitted.map((e) => e.getType())
    expect(types).toContain(GameEventType.HeroDestroyed)
    expect(types).toContain(GameEventType.CardRetrieved)
    expect(types).not.toContain(GameEventType.CardDiscarded)
    expect(types).not.toContain(GameEventType.CardDrawn)
  })

  it('a bare hero: destroyed as printed, nothing comes to hand', () => {
    const gs = makeGs()
    seat(gs, 'p1', [])
    seat(gs, 'p2', [], ['h2'])
    gs.registerCard(hero('h2'))
    const ctx = new AbilityContext('hero-023', 'p1')
    const { em, rm } = wire(gs)
    const [choose, destroy, retrieve] = ShurikittyAbility[0].steps
    choose.execute(gs, ctx, em, rm)
    answer(gs, ctx, 'h2')
    destroy.execute(gs, ctx, em, rm)
    expect(ctx.get(CTX_DESTROYED_HERO_ITEM)).toEqual([])
    retrieve.execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p1')!.getHand()).toEqual([])
    expect(gs.getDiscardPile().getAll()).toEqual(['h2'])
  })
})
