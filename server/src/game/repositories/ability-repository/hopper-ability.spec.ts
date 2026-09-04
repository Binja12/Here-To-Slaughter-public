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
import { HopperAbility } from './hopper-ability'

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

// Hopper (hero-033): "Choose a player. That player must SACRIFICE a Hero card."

describe('Hopper (hero-033)', () => {
  it('offers only players with heroes; the chosen one picks their own hero and sacrifices it', () => {
    const gs = makeGs()
    seat(gs, 'p1', [], ['mine'])
    seat(gs, 'p2', [], ['theirs'])
    seat(gs, 'p3')
    for (const id of ['mine', 'theirs']) gs.registerCard(hero(id))
    const ctx = new AbilityContext('hero-033', 'p1')

    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em)
    const [choosePlayer, chooseHero, sacrifice] = HopperAbility[0].steps
    choosePlayer.execute(gs, ctx, em, rm)
    let window = [...gs.getFrames().values()].flatMap((f) => f.windows)[0]
    expect(window.getOptions()).toEqual(['p2']) // p3 has no heroes
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])
    window.resolve()

    chooseHero.execute(gs, ctx, em, rm)
    window = [...gs.getFrames().values()].flatMap((f) => f.windows).find((w) => w.isOpen())!
    expect(window.getRespondentId()).toBe('p2')
    expect(window.getOptions()).toEqual(['theirs'])
    ctx.set(CTX_CHOSEN_CARD, ['theirs'])
    window.resolve()

    const emitted: IGameEvent[] = []
    em.addListener({ onEvent: (e) => emitted.push(e) })
    sacrifice.execute(gs, ctx, em, rm)
    expect(gs.getParty('p2').getHeroIds()).toEqual([])
    expect(gs.getParty('p1').getHeroIds()).toEqual(['mine'])
    expect(emitted.find((e) => e.getType() === GameEventType.HeroSacrificed)!.getPlayerId()).toBe('p2')
  })
})
