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
import { GreedyCheeksAbility } from './greedy-cheeks-ability'

// Greedy Cheeks (hero-047): "Every opponent hands you one card from their hand."

describe('Greedy Cheeks (hero-047)', () => {
  it('asks every other seat at once, over its own hand, and every pick lands in mine', () => {
    const gs = makeGs()
    seat(gs, 'p1', ['mine'], ['hero-047'])
    seat(gs, 'p2', ['a', 'a2'])
    seat(gs, 'p3', ['b'])
    for (const id of ['hero-047', 'mine', 'a', 'a2', 'b']) gs.registerCard(hero(id))
    const { em, emitted, rm } = wire(gs)
    new TaskManager(gs, em, rm, new Map([['hero-047', GreedyCheeksAbility]]))

    em.emit(GameEventFactory.rollSuccess('p1', 'hero-047'))

    expect(openWindows(gs).map((w) => w.getRespondentId())).toEqual(['p2', 'p3'])
    expect(windowOf(gs, 'p2').getOptions()).toEqual(['a', 'a2'])
    windowOf(gs, 'p3').submitReaction('p3', { choice: 'b' })
    windowOf(gs, 'p2').submitReaction('p2', { choice: 'a2' })

    expect(gs.getPlayer('p1')!.getHand()).toEqual(['mine', 'a2', 'b'])
    expect(gs.getPlayer('p2')!.getHand()).toEqual(['a'])
    expect(gs.getPlayer('p3')!.getHand()).toEqual([])
    expect(emitted.filter((e) => e.getType() === GameEventType.CardPulled)).toHaveLength(2)
    expect(gs.getPipelines()).toEqual([])
  })
})
