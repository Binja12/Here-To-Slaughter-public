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
import { WindsOfChangeAbility } from './winds-of-change-ability'

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
      const window = [...gs.getFrames().values()].flatMap((f) => f.windows)[0]
      // the pick the player would make, written where the window would write it
      ctx.set(window.resultKey() as string, pick === undefined ? [] : [pick])
      window.resolve()
    }
  }
  return { emitted, window: () => [...gs.getFrames().values()].flatMap((f) => f.windows)[0] }
}

// Winds of Change (magic-058, magic-059): "Return any equipped item to its
// owner's hand, then draw a card."

describe('Winds of Change (magic-058)', () => {
  it('fires on its settled challenge frame', () => {
    expect(WindsOfChangeAbility[0].trigger).toMatchObject({ on: GameEventType.FrameResolved, scope: 'SelfCard' })
  })

  it("offers every worn item on the table, sends the pick to ITS player's hand, then the caster draws", () => {
    const gs = makeGs()
    gs.getMainDeck().addToBottom('drawn')
    seat(gs, 'p1', [], ['mine'])
    seat(gs, 'p2', [], ['theirs'])
    gs.registerCard(hero('mine'))
    gs.registerCard(hero('theirs'))
    gs.registerCard(item('my-ring'))
    gs.registerCard(item('their-ring'))
    gs.registerCard(hero('drawn'))
    gs.getParty('p1').equipItem('mine', 'my-ring')
    gs.getParty('p2').equipItem('theirs', 'their-ring')
    const ctx = new AbilityContext('magic-058', 'p1')

    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em)
    const [choose, retrieve, draw] = WindsOfChangeAbility[0].steps
    choose.execute(gs, ctx, em, rm)
    const window = [...gs.getFrames().values()].flatMap((f) => f.windows)[0]
    expect([...window.getOptions()].sort()).toEqual(['my-ring', 'their-ring'])

    ctx.set(CTX_CHOSEN_CARD, ['their-ring'])
    retrieve.execute(gs, ctx, em, rm)
    draw.execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p2')!.getHand()).toEqual(['their-ring'])
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['drawn'])
    expect(gs.getEquippedItem('theirs')).toBeUndefined()
  })
})
