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
import { HolyCurselifterAbility } from './holy-curselifter-ability'

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

// Holy Curselifter (hero-026): "Return a cursed item worn by one of your
// heroes to your hand."

describe('Holy Curselifter (hero-026)', () => {
  it('offers only the CURSED items worn in the owner\'s own party, and the pick comes to hand', () => {
    const gs = makeGs()
    seat(gs, 'p1', [], ['mine-1', 'mine-2'])
    seat(gs, 'p2', [], ['theirs'])
    for (const id of ['mine-1', 'mine-2', 'theirs']) gs.registerCard(hero(id))
    gs.registerCard(item('curse', true))
    gs.registerCard(item('plain'))
    gs.registerCard(item('their-curse', true))
    gs.getParty('p1').equipItem('mine-1', 'curse')
    gs.getParty('p1').equipItem('mine-2', 'plain')
    gs.getParty('p2').equipItem('theirs', 'their-curse')
    const ctx = new AbilityContext('hero-026', 'p1')

    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em)
    const [choose, retrieve] = HolyCurselifterAbility[0].steps
    choose.execute(gs, ctx, em, rm)
    const window = [...gs.getFrames().values()].flatMap((f) => f.windows)[0]
    expect(window.getOptions()).toEqual(['curse'])

    ctx.set(CTX_CHOSEN_CARD, ['curse'])
    retrieve.execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['curse'])
    expect(gs.getEquippedItem('mine-1')).toBeUndefined()
    expect(gs.getParty('p1').getHeroIds()).toContain('mine-1')
  })
})
