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
import { SilentShadowAbility } from './silent-shadow-ability'

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

// Silent Shadow (hero-021): "Look through an opponent's hand and take any one
// card from it."

describe('Silent Shadow (hero-021)', () => {
  it("the look is a CardChoice over the chosen player's hand, answered by the OWNER; the pick changes hands", () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2', ['their-1', 'their-2'])
    const ctx = new AbilityContext('hero-021', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2']) // the ChoosePlayerTask's answer

    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em)
    const [chooseCard, take] = SilentShadowAbility[1].steps
    chooseCard.execute(gs, ctx, em, rm)
    const window = [...gs.getFrames().values()].flatMap((f) => f.windows)[0]
    expect(window.getRespondentId()).toBe('p1')
    expect(window.getOptions()).toEqual(['their-1', 'their-2'])

    ctx.set(CTX_CHOSEN_CARD, ['their-2'])
    take.execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['their-2'])
    expect(gs.getPlayer('p2')!.getHand()).toEqual(['their-1'])
  })
})
