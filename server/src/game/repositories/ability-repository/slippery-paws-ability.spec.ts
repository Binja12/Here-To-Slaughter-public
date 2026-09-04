import { CardType, GameEventType, HeroClass, IGameEvent, ReactionWindowType } from 'shared'
import { GameState } from '../../pipelines/game-state'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { HeroCard } from '../../cards/hero-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { GameEventFactory } from '../../events/game-event-factory'
import { AbilityContext } from '../../abilities/ability-context'
import { IReactionWindow } from '../../interfaces'

const makeGs = () =>
  new GameState(new CardStack('deck', 'main'), new CardPile('discard', 'discard'), new CardStack('mdeck', 'monster-deck'), new CardPile('mpile', 'monster-pile'))

const seat = (gs: GameState, id: string, hand: string[] = [], heroIds: string[] = [], monsterIds: string[] = []) => {
  gs.registerPlayer(new Player({ id, name: id, hand, partyId: `${id}-party`, actionPoints: 3 }))
  gs.registerParty(new Party({ playerId: id, leaderId: `${id}-leader`, heroIds, monsterIds }))
}

const hero = (id: string, heroClass = HeroClass.Thief) =>
  new HeroCard({ id, name: id, type: CardType.Hero, image: '', description: '', set: 'base', heroClass, rollReq: 5 })

const openWindows = (gs: GameState): IReactionWindow[] => gs.openWindows()
const windowOf = (gs: GameState, seatId: string) => openWindows(gs).find((w) => w.getRespondentId() === seatId)!

const wire = (gs: GameState) => {
  const em = new GameEventEmitter()
  const emitted: IGameEvent[] = []
  em.addListener({ onEvent: (e) => emitted.push(e) })
  return { em, emitted, rm: new ReactionManager(gs, em) }
}
import { SlipperyPawsAbility } from './slippery-paws-ability'

// Slippery Paws (hero-022): "Pull 2 cards from another player's hand, then
// DISCARD one of those cards."

describe('Slippery Paws (hero-022)', () => {
  it('pulls two from the chosen hand, then offers exactly those two out of my hand, and discards the pick', () => {
    const gs = makeGs()
    seat(gs, 'p1', ['mine'], ['hero-022'])
    seat(gs, 'p2', ['a', 'b'])
    seat(gs, 'p3', ['c'])
    for (const id of ['hero-022', 'mine', 'a', 'b', 'c']) gs.registerCard(hero(id))
    const { em, emitted, rm } = wire(gs)
    new TaskManager(gs, em, rm, new Map([['hero-022', SlipperyPawsAbility]]))

    em.emit(GameEventFactory.rollSuccess('p1', 'hero-022'))

    windowOf(gs, 'p1').submitReaction('p1', { choice: 'p2' })
    expect(gs.getPlayer('p2')!.getHand()).toEqual([])
    const which = windowOf(gs, 'p1')
    expect(which.getType()).toBe(ReactionWindowType.CardChoice)
    expect([...which.getOptions()].sort()).toEqual(['a', 'b']) // never 'mine'
    which.submitReaction('p1', { choice: 'a' })

    expect(gs.getPlayer('p1')!.getHand()).toEqual(['mine', 'b'])
    expect(gs.getDiscardPile().getAll()).toEqual(['a'])
    expect(emitted.filter((e) => e.getType() === GameEventType.CardPulled)).toHaveLength(2)
    expect(emitted.filter((e) => e.getType() === GameEventType.CardDiscarded)).toHaveLength(1)
    expect(gs.abilityPipelines).toEqual([])
  })

  it('a one-card hand: one pull, and that one is offered', () => {
    const gs = makeGs()
    seat(gs, 'p1', [], ['hero-022'])
    seat(gs, 'p2', ['a'])
    for (const id of ['hero-022', 'a']) gs.registerCard(hero(id))
    const { em, rm } = wire(gs)
    new TaskManager(gs, em, rm, new Map([['hero-022', SlipperyPawsAbility]]))
    em.emit(GameEventFactory.rollSuccess('p1', 'hero-022'))
    windowOf(gs, 'p1').submitReaction('p1', { choice: 'p2' })
    expect(windowOf(gs, 'p1').getOptions()).toEqual(['a'])
  })
})
