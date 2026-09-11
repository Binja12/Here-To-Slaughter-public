import { CardType, GameEventType, HeroClass, IGameEvent, Owner, ReactionWindowType, Zone } from 'shared'
import { GameState } from '../../pipelines/game-state'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { HeroCard } from '../../cards/hero-card'
import { ItemCard } from '../../cards/item-card'
import { buildCard } from '../../cards/card-factory'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { AbilityContext, CTX_CHOSEN_CARD, CTX_CHOSEN_PLAYER } from '../../abilities/ability-context'
import { BunBunAbility } from './bun-bun-ability'

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

// Bun Bun (hero-039): "Take a magic card of your choice from the discard pile into your hand."

describe('Bun Bun (hero-039)', () => {
  it('fires on its own successful roll', () => {
    expect(BunBunAbility[0].trigger).toMatchObject({ on: GameEventType.RollSuccess, scope: 'SelfCard' })
  })

  it('offers only the Magic cards in the discard pile, and the pick comes to hand', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    gs.registerCard(buildCard({ id: 'wanted', name: 'wanted', type: CardType.Magic, image: '', description: '', set: 'base' }))
    gs.registerCard(hero('other'))
    gs.getDiscardPile().add('wanted')
    gs.getDiscardPile().add('other')
    const ctx = new AbilityContext('hero-039', 'p1')

    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em)
    const [choose, retrieve] = BunBunAbility[0].steps
    choose.execute(gs, ctx, em, rm)
    const window = [...gs.getFrames().values()].flatMap((f) => f.windows)[0]
    expect(window.getType()).toBe(ReactionWindowType.CardChoice)
    expect(window.getRespondentId()).toBe('p1')
    expect(window.getOptions()).toEqual(['wanted'])

    ctx.set(CTX_CHOSEN_CARD, ['wanted'])
    retrieve.execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['wanted'])
    expect(gs.getDiscardPile().getAll()).toEqual(['other'])
  })
})
