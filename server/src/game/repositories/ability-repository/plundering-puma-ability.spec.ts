import { CardType, GameEventType, HeroClass, IGameEvent, ReactionWindowType } from 'shared'
import { GameState } from '../../pipelines/game-state'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { HeroCard } from '../../cards/hero-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import {
  AbilityContext,
  CTX_CHOSEN_CARD,
  CTX_CHOSEN_PLAYER,
  CTX_PULLED_CARD_IDS,
} from '../../abilities/ability-context'
import { PlunderingPumaAbility } from './plundering-puma-ability'

const makeGs = (deck: string[] = []) => {
  const main = new CardStack('deck', 'main')
  for (const id of deck) main.addToBottom(id)
  return new GameState(
    main,
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )
}

const seat = (gs: GameState, id: string, hand: string[] = [], heroIds: string[] = []) => {
  gs.registerPlayer(new Player({ id, name: id, hand, partyId: `${id}-party`, actionPoints: 3 }))
  gs.registerParty(new Party({ playerId: id, leaderId: `${id}-leader`, heroIds, monsterIds: [] }))
}

const hero = (id: string, heroClass = HeroClass.Thief) =>
  new HeroCard({ id, name: id, type: CardType.Hero, image: '', description: '', set: 'base', heroClass, rollReq: 5 })

const collect = () => {
  const em = new GameEventEmitter()
  const emitted: IGameEvent[] = []
  em.addListener({ onEvent: (e) => emitted.push(e) })
  return { em, emitted }
}

const openWindow = (gs: GameState) =>
  [...gs.frames.values()].flatMap((f) => f.windows).find((w) => w.isOpen())!

// Plundering Puma (hero-020): "Pull 2 cards from another player's hand. That
// player may DRAW a card."

describe('Plundering Puma (hero-020)', () => {
  it('pulls twice from the chosen seat, then asks THAT seat whether to draw, seat riding along', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2', ['a', 'b'])
    const ctx = new AbilityContext('hero-020', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])
    const { em } = collect()
    const rm = new ReactionManager(gs, em)

    const [, pull1, pull2, ask] = PlunderingPumaAbility[0].steps
    pull1.execute(gs, ctx, em, rm)
    pull2.execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p2')!.getHand()).toEqual([])
    expect(gs.getPlayer('p1')!.getHand().sort()).toEqual(['a', 'b'])

    ask.execute(gs, ctx, em, rm)
    const window = openWindow(gs)
    expect(window.getType()).toBe(ReactionWindowType.TaskChoice)
    expect(window.getRespondentId()).toBe('p2')
    expect(window.getDetail()).toMatchObject({ ctxSeed: { [CTX_CHOSEN_PLAYER]: ['p2'] } })
  })

  it('a yes draws for the chosen seat, not the owner', () => {
    const gs = makeGs(['top'])
    seat(gs, 'p1')
    seat(gs, 'p2')
    const ctx = new AbilityContext('hero-020', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2']) // as the confirm's seed leaves it
    const { em } = collect()

    PlunderingPumaAbility[1].steps[0].execute(gs, ctx, em, new ReactionManager(gs, em))

    expect(gs.getPlayer('p2')!.getHand()).toEqual(['top'])
    expect(gs.getPlayer('p1')!.getHand()).toEqual([])
  })
})
