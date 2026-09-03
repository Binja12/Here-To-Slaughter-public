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
import { HeavyBearAbility } from './heavy-bear-ability'

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

// Heavy Bear (hero-004): "Choose a player. That player must DISCARD 2 cards."
// The full run, seat to seat, is in victim-choice.spec.ts.

describe('Heavy Bear (hero-004)', () => {
  it('the discard choices are the CHOSEN player\'s, over their own hand, and they pay', () => {
    const gs = makeGs()
    seat(gs, 'p1', ['mine'])
    seat(gs, 'p2', ['a', 'b'])
    const ctx = new AbilityContext('hero-004', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])

    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em)
    const [, choose1, discard1, choose2, discard2] = HeavyBearAbility[0].steps
    choose1.execute(gs, ctx, em, rm)
    let window = [...gs.frames.values()].flatMap((f) => f.windows)[0]
    expect(window.getRespondentId()).toBe('p2')
    expect(window.getOptions()).toEqual(['a', 'b'])
    ctx.set(CTX_CHOSEN_CARD, ['b'])
    window.resolve()
    discard1.execute(gs, ctx, em, rm)

    choose2.execute(gs, ctx, em, rm)
    window = [...gs.frames.values()].flatMap((f) => f.windows).find((w) => w.isOpen())!
    expect(window.getOptions()).toEqual(['a'])
    ctx.set(CTX_CHOSEN_CARD, ['a'])
    window.resolve()
    discard2.execute(gs, ctx, em, rm)

    expect(gs.getPlayer('p2')!.getHand()).toEqual([])
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['mine'])
    expect(gs.getDiscardPile().getAll().sort()).toEqual(['a', 'b'])
  })
})
