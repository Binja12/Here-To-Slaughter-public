import { CardType, GameEventType, HeroClass, IGameEvent, Owner, ReactionWindowType, Zone } from 'shared'
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
import { SpookyAbility } from './spooky-ability'

const makeGs = () =>
  new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

const seat = (gs: GameState, id: string, hand: string[] = [], heroIds: string[] = []) => {
  gs.registerPlayer(new Player({ id, name: id, hand, partyId: `${id}-party`, actionPoints: 3 }))
  gs.registerParty(new Party({ playerId: id, leaderId: `${id}-leader`, heroIds, monsterIds: [] }))
}

const hero = (id: string, heroClass = HeroClass.Thief) =>
  new HeroCard({ id, name: id, type: CardType.Hero, image: '', description: '', set: 'base', heroClass, rollReq: 5 })

const item = (id: string, cursed = false) =>
  new ItemCard({ id, name: id, type: CardType.Item, image: '', description: '', set: 'base', cursed })


/** Runs an entry's steps in order, answering the ONE choice window with `pick`. */
function run(gs: GameState, steps: readonly { execute: Function }[], ctx: AbilityContext, pick?: unknown) {
  const em = new GameEventEmitter()
  const emitted: IGameEvent[] = []
  em.addListener({ onEvent: (e) => emitted.push(e) })
  const rm = new ReactionManager(gs, em)
  for (const step of steps) {
    const frameId = step.execute(gs, ctx, em, rm) as string | void
    if (frameId) {
      const window = [...gs.frames.values()].flatMap((f) => f.windows)[0]
      // the pick the player would make, written where the window would write it
      ctx.set(window.resultKey() as string, pick === undefined ? [] : [pick])
      window.resolve()
    }
  }
  return { emitted, window: () => [...gs.frames.values()].flatMap((f) => f.windows)[0] }
}

// Spooky (hero-035): "Each other player must SACRIFICE a Hero card."

describe('Spooky (hero-035)', () => {
  it('goes round the table: one PlayerTargeted per seat the filter keeps, then the per-seat entry', () => {
    const gs = makeGs()
    seat(gs, 'p1', [], ['mine'])
    seat(gs, 'p2', [], ['theirs'])
    seat(gs, 'p3') // no heroes: nothing to sacrifice, not targeted
    for (const id of ['mine', 'theirs']) gs.registerCard(hero(id))
    const em = new GameEventEmitter()
    const emitted: IGameEvent[] = []
    em.addListener({ onEvent: (e) => emitted.push(e) })
    const rm = new ReactionManager(gs, em)

    SpookyAbility[0].steps[0].execute(gs, new AbilityContext('hero-035', 'p1'), em, rm)
    const targeted = emitted.filter((e) => e.getType() === GameEventType.PlayerTargeted)
        expect(targeted.map((e) => (e.getPayload() as { ctxSeed: Record<string, string[]> }).ctxSeed[CTX_CHOSEN_PLAYER])).toEqual([['p2']])
    expect(SpookyAbility[1].trigger).toMatchObject({ on: GameEventType.PlayerTargeted, scope: 'SelfCard' })
    expect(SpookyAbility[1].trigger.when).toBe((targeted[0].getPayload() as { label: string }).label)
  })

  it('the per-seat entry: the targeted seat pays', () => {
    const gs = makeGs()
    seat(gs, 'p1', [], ['mine'])
    seat(gs, 'p2', [], ['theirs'])
    seat(gs, 'p3') // no heroes: nothing to sacrifice, not targeted
    for (const id of ['mine', 'theirs']) gs.registerCard(hero(id))
    const ctx = new AbilityContext('hero-035', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2']) // as the PlayerTargeted seed would
    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em)
    const [choose, sacrifice] = SpookyAbility[1].steps
    choose.execute(gs, ctx, em, rm)
    const window = [...gs.frames.values()].flatMap((f) => f.windows)[0]
    expect(window.getRespondentId()).toBe('p2')
    expect(window.getOptions()).toEqual(['theirs'])
    ctx.set(CTX_CHOSEN_CARD, ['theirs'])
    window.resolve()
    sacrifice.execute(gs, ctx, em, rm)
    expect(gs.getParty('p2').getHeroIds()).toEqual([])
    expect(gs.getParty('p1').getHeroIds()).toEqual(['mine'])
  })
})
