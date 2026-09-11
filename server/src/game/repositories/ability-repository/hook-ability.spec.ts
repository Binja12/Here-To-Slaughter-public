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
import { HookAbility } from './hook-ability'
import { CTX_CHOSEN_ITEM } from '../../abilities/ability-context'

// Hook (hero-013): "Play an Item card from your hand immediately and DRAW a card."

describe('Hook (hero-013)', () => {
  it('picks an item into its own slot, a hero into the default one, plays the item and draws', () => {
    const gs = makeGs(['top'])
    seat(gs, 'p1', ['sword', 'spell'], ['h1'])
    gs.registerCard(hero('h1'))
    gs.registerCard(item('sword'))
    gs.registerCard(new HeroCard({ id: 'spell', name: 'spell', type: CardType.Magic, image: '', description: '', set: 'base', heroClass: HeroClass.Thief, rollReq: 5 }))
    const ctx = new AbilityContext('hero-013', 'p1')
    const { em, emitted, rm } = wire(gs)
    const [pickItem, pickHero, play, draw] = HookAbility[0].steps

    pickItem.execute(gs, ctx, em, rm)
    expect(openWindow(gs).getOptions()).toEqual(['sword'])
    expect(openWindow(gs).resultKey()).toBe(CTX_CHOSEN_ITEM)
    answer(gs, ctx, 'sword')
    pickHero.execute(gs, ctx, em, rm)
    expect(openWindow(gs).resultKey()).toBe(CTX_CHOSEN_CARD)
    answer(gs, ctx, 'h1')
    expect(ctx.get(CTX_CHOSEN_ITEM)).toEqual(['sword']) // survived the second pick

    const frameId = play.execute(gs, ctx, em, rm)
    expect(frameId).toBeTruthy() // the challenge window, like any played item
    expect(gs.getEquippedItem('h1')).toBe('sword')
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['spell'])
    draw.execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['spell', 'top'])
    expect(emitted.filter((e) => e.getType() === GameEventType.CardDrawn)).toHaveLength(1)
  })

  it('no item in hand: the hero pick is not asked, nothing is played, the draw still happens', () => {
    const gs = makeGs(['top'])
    seat(gs, 'p1', [], ['h1'])
    gs.registerCard(hero('h1'))
    const ctx = new AbilityContext('hero-013', 'p1')
    const { em, rm } = wire(gs)
    const [pickItem, pickHero, play, draw] = HookAbility[0].steps
    pickItem.execute(gs, ctx, em, rm)
    expect(openWindow(gs).getOptions()).toEqual([])
    answer(gs, ctx)
    expect(pickHero.execute(gs, ctx, em, rm)).toBeUndefined()
    expect(ctx.get(CTX_CHOSEN_CARD)).toEqual([])
    expect(play.execute(gs, ctx, em, rm)).toBeUndefined()
    draw.execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['top'])
  })
})
