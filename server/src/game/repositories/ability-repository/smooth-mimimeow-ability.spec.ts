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
import { SmoothMimimeowAbility } from './smooth-mimimeow-ability'

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

// Smooth Mimimeow (hero-024): "Pull a card from the hand of each other player with a Thief in their Party."

describe('Smooth Mimimeow (hero-024)', () => {
  it('goes round the table: one PlayerTargeted per seat the filter keeps, then the per-seat entry', () => {
    const gs = makeGs()
    seat(gs, 'p1', [])
    seat(gs, 'p2', ['a'], ['t'])
    seat(gs, 'p3', ['b'], ['w'])
    gs.registerCard(hero('t', HeroClass.Thief))
    gs.registerCard(hero('w', HeroClass.Wizard))
    const em = new GameEventEmitter()
    const emitted: IGameEvent[] = []
    em.addListener({ onEvent: (e) => emitted.push(e) })
    const rm = new ReactionManager(gs, em)

    SmoothMimimeowAbility[0].steps[0].execute(gs, new AbilityContext('hero-024', 'p1'), em, rm)
    const targeted = emitted.filter((e) => e.getType() === GameEventType.PlayerTargeted)
        // p3 fields no Thief, so it is left alone
    expect(targeted.map((e) => (e.getPayload() as { ctxSeed: Record<string, string[]> }).ctxSeed[CTX_CHOSEN_PLAYER])).toEqual([['p2']])
    expect(SmoothMimimeowAbility[1].trigger).toMatchObject({ on: GameEventType.PlayerTargeted, scope: 'SelfCard' })
    expect(SmoothMimimeowAbility[1].trigger.when).toBe((targeted[0].getPayload() as { label: string }).label)
  })

  it('the per-seat entry: the targeted seat pays', () => {
    const gs = makeGs()
    seat(gs, 'p1', [])
    seat(gs, 'p2', ['a'], ['t'])
    seat(gs, 'p3', ['b'], ['w'])
    gs.registerCard(hero('t', HeroClass.Thief))
    gs.registerCard(hero('w', HeroClass.Wizard))
    const ctx = new AbilityContext('hero-024', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2']) // as the PlayerTargeted seed would
    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em)
    const [pull] = SmoothMimimeowAbility[1].steps
    pull.execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['a'])
    expect(gs.getPlayer('p2')!.getHand()).toEqual([])
  })
})
