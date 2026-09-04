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
import { TriggerScope } from 'shared'
import { BloodwingAbility } from './bloodwing-ability'
import { triggerMatches } from '../../abilities/ability-lifecycle'
import { GameEventFactory } from '../../events/game-event-factory'

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

// Bloodwing (monster-127): "Each time another player CHALLENGES you, that
// player must DISCARD a card."

describe('Bloodwing (monster-127)', () => {
  it("fires on a challenge aimed at the owner's card by somebody else, and on nothing else", () => {
    const gs = makeGs()
    seat(gs, 'p1', [], ['mine'])
    seat(gs, 'p2', [], ['theirs'])
    gs.registerCard(hero('mine'))
    gs.registerCard(hero('theirs'))
    const source = { sourceCardId: 'monster-127', ownerId: 'p1' }
    const trigger = BloodwingAbility[0].trigger
    expect(trigger.scope).toBe(TriggerScope.TargetsOwner)

    expect(triggerMatches(gs, source, trigger, GameEventFactory.challengePlayed('p2', 'challenge-102', 'mine'))).toBe(true)
    expect(triggerMatches(gs, source, trigger, GameEventFactory.challengePlayed('p2', 'challenge-102', 'theirs'))).toBe(false)
    expect(triggerMatches(gs, source, trigger, GameEventFactory.challengePlayed('p1', 'challenge-102', 'mine'))).toBe(false)
  })

  it('the challenger, handed in as the chosen seat, picks from their own hand and discards', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2', ['x', 'y'])
    const ctx = new AbilityContext('monster-127', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2']) // as TaskManager seeds it for TargetsOwner
    const { em } = collect()
    const rm = new ReactionManager(gs, em)

    const [choose, discard] = BloodwingAbility[0].steps
    choose.execute(gs, ctx, em, rm)
    const window = openWindow(gs)
    expect(window.getRespondentId()).toBe('p2')
    expect(window.getOptions()).toEqual(['x', 'y'])
    ctx.set(CTX_CHOSEN_CARD, ['y'])
    window.resolve()
    discard.execute(gs, ctx, em, rm)

    expect(gs.getPlayer('p2')!.getHand()).toEqual(['x'])
    expect(gs.getDiscardPile().getAll()).toEqual(['y'])
  })
})
