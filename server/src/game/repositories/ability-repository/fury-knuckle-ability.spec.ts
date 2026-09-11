import { CardBase, CardType, GameEventType, HeroClass, IGameEvent, ReactionWindowType } from 'shared'
import { GameState } from '../../pipelines/game-state'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { HeroCard } from '../../cards/hero-card'
import { buildCard } from '../../cards/card-factory'
import { GameEventEmitter } from '../../events/game-event-emitter'
import {
  AbilityContext,
  CTX_CHOSEN_CARD,
  CTX_CHOSEN_PLAYER,
  CTX_PULLED_CARD_IDS,
} from '../../abilities/ability-context'
import { FuryKnuckleAbility } from './fury-knuckle-ability'

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
  [...gs.getFrames().values()].flatMap((f) => f.windows).find((w) => w.isOpen())!

// Fury Knuckle (hero-002): "Take a random card from an opponent's hand. If it
// turns out to be a challenge card, take one more from the same hand."

describe('Fury Knuckle (hero-002)', () => {
  it('a pulled Challenge card announces the condition WITH the chosen seat riding along', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2', ['theirs'])
    gs.registerCard(buildCard({ id: 'theirs', name: 'theirs', type: CardType.Challenge, image: '', description: '', set: 'base' } as CardBase))
    const ctx = new AbilityContext('hero-002', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])
    const { em, emitted } = collect()
    const rm = new ReactionManager(gs, em)

    const [pull, condition] = FuryKnuckleAbility[1].steps
    pull.execute(gs, ctx, em, rm)
    condition.execute(gs, ctx, em, rm)

    const met = emitted.find((e) => e.getType() === GameEventType.ConditionMet)!
    expect(met.getPayload()).toMatchObject({
      ctxSeed: { [CTX_PULLED_CARD_IDS]: ['theirs'], [CTX_CHOSEN_PLAYER]: ['p2'] },
    })
    expect(FuryKnuckleAbility[2].trigger).toMatchObject({ on: GameEventType.ConditionMet, when: (met.getPayload() as { label: string }).label })
  })

  it('a pulled Hero card announces nothing — one pull only', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2', ['theirs'])
    gs.registerCard(hero('theirs'))
    const ctx = new AbilityContext('hero-002', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])
    const { em, emitted } = collect()
    const rm = new ReactionManager(gs, em)

    const [pull, condition] = FuryKnuckleAbility[1].steps
    pull.execute(gs, ctx, em, rm)
    condition.execute(gs, ctx, em, rm)

    expect(emitted.map((e) => e.getType())).not.toContain(GameEventType.ConditionMet)
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['theirs'])
  })

  it('the second entry pulls from the SAME seat, seeded by the condition', () => {
    const gs = makeGs()
    seat(gs, 'p1', ['first'])
    seat(gs, 'p2', ['second'])
    const ctx = new AbilityContext('hero-002', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2']) // as the seed leaves it
    const { em } = collect()

    FuryKnuckleAbility[2].steps[0].execute(gs, ctx, em, new ReactionManager(gs, em))

    expect(gs.getPlayer('p1')!.getHand()).toEqual(['first', 'second'])
    expect(gs.getPlayer('p2')!.getHand()).toEqual([])
  })
})
