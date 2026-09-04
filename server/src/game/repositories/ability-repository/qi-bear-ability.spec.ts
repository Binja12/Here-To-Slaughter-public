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
import { QiBearAbility } from './qi-bear-ability'

// Qi Bear (hero-007): "DISCARD up to 3 cards. For each card discarded,
// DESTROY a Hero card."

/** Runs the whole entry, answering each window from `picks` in order (undefined = picked nothing). */
function play(gs: GameState, ctx: AbilityContext, picks: (string | undefined)[]) {
  const { em, emitted, rm } = wire(gs)
  const queue = [...picks]
  for (const step of QiBearAbility[0].steps) {
    const frameId = step.execute(gs, ctx, em, rm) as string | void
    if (frameId) answer(gs, ctx, queue.shift())
  }
  return { emitted, unanswered: queue.length }
}

describe('Qi Bear (hero-007)', () => {
  it('three discards buy three destroys, pick by pick', () => {
    const gs = makeGs()
    seat(gs, 'p1', ['c1', 'c2', 'c3'], ['h1'])
    seat(gs, 'p2', [], ['h2', 'h3'])
    for (const id of ['h1', 'h2', 'h3', 'c1', 'c2', 'c3']) gs.registerCard(hero(id))
    const ctx = new AbilityContext('hero-007', 'p1')
    const { emitted, unanswered } = play(gs, ctx, ['c1', 'h2', 'c2', 'h3', 'c3', 'h1'])
    expect(unanswered).toBe(0)
    expect(gs.getPlayer('p1')!.getHand()).toEqual([])
    expect(gs.getParty('p2').getHeroIds()).toEqual([])
    expect(gs.getParty('p1').getHeroIds()).toEqual([])
    expect(emitted.filter((e) => e.getType() === GameEventType.HeroDestroyed)).toHaveLength(3)
  })

  it('"up to": stopping after one discard skips that round\'s destroy and every later round', () => {
    const gs = makeGs()
    seat(gs, 'p1', ['c1', 'c2', 'c3'])
    seat(gs, 'p2', [], ['h2', 'h3'])
    for (const id of ['h2', 'h3', 'c1', 'c2', 'c3']) gs.registerCard(hero(id))
    const ctx = new AbilityContext('hero-007', 'p1')
    // one card, one hero, then "no more"
    const { emitted, unanswered } = play(gs, ctx, ['c1', 'h2', undefined])
    expect(unanswered).toBe(0) // no further window was opened
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['c2', 'c3'])
    expect(gs.getParty('p2').getHeroIds()).toEqual(['h3'])
    expect(emitted.filter((e) => e.getType() === GameEventType.HeroDestroyed)).toHaveLength(1)
  })

  it('declining the first discard ends it there — no destroy is offered', () => {
    const gs = makeGs()
    seat(gs, 'p1', ['c1'])
    seat(gs, 'p2', [], ['h2'])
    for (const id of ['h2', 'c1']) gs.registerCard(hero(id))
    const ctx = new AbilityContext('hero-007', 'p1')
    const { unanswered } = play(gs, ctx, [undefined])
    expect(unanswered).toBe(0)
    expect(gs.getParty('p2').getHeroIds()).toEqual(['h2'])
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['c1'])
  })
})
