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
import { DodgyDealerAbility } from './dodgy-dealer-ability'

// Dodgy Dealer (hero-046): "Trade hands with another player."

describe('Dodgy Dealer (hero-046)', () => {
  it('the two hands change places, announced once', () => {
    const gs = makeGs()
    seat(gs, 'p1', ['a', 'b'])
    seat(gs, 'p2', ['x'])
    seat(gs, 'p3', ['z'])
    const ctx = new AbilityContext('hero-046', 'p1')
    const { em, emitted, rm } = wire(gs)
    const [choose] = DodgyDealerAbility[0].steps
    const [trade] = DodgyDealerAbility[1].steps
    choose.execute(gs, ctx, em, rm)
    expect(openWindow(gs).getOptions()).toEqual(['p2', 'p3'])
    answer(gs, ctx, 'p2')
    trade.execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['x'])
    expect(gs.getPlayer('p2')!.getHand()).toEqual(['a', 'b'])
    expect(gs.getPlayer('p3')!.getHand()).toEqual(['z'])
    const traded = emitted.filter((e) => e.getType() === GameEventType.HandsTraded)
    expect(traded).toHaveLength(1)
    expect(traded[0].getPayload()).toEqual({ withPlayerId: 'p2' })
    expect(emitted.some((e) => e.getType() === GameEventType.CardPulled)).toBe(false)
  })

  it('an empty hand trades too', () => {
    const gs = makeGs()
    seat(gs, 'p1', ['a'])
    seat(gs, 'p2', [])
    const ctx = new AbilityContext('hero-046', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])
    const { em, rm } = wire(gs)
    DodgyDealerAbility[1].steps[0].execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p1')!.getHand()).toEqual([])
    expect(gs.getPlayer('p2')!.getHand()).toEqual(['a'])
  })
})
