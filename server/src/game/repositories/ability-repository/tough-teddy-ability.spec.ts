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
import { ToughTeddyAbility } from './tough-teddy-ability'

// Tough Teddy (hero-006): "Every opponent who has a Fighter in their party discards one card."

describe('Tough Teddy (hero-006)', () => {
  it('asks every Fighter seat at once, and each discards its own pick', () => {
    const gs = makeGs()
    seat(gs, 'p1', ['mine'], ['hero-006'])
    seat(gs, 'p2', ['a'], ['f'])
    seat(gs, 'p3', ['b'], ['w'])
    seat(gs, 'p4', ['c'], ['f2'])
    gs.registerCard(hero('hero-006'))
    gs.registerCard(hero('f', HeroClass.Fighter))
    gs.registerCard(hero('f2', HeroClass.Fighter))
    gs.registerCard(hero('w', HeroClass.Wizard))
    for (const id of ['mine', 'a', 'b', 'c']) gs.registerCard(hero(id))
    const { em, emitted, rm } = wire(gs)
    new TaskManager(gs, em, rm, new Map([['hero-006', ToughTeddyAbility]]))

    em.emit(GameEventFactory.rollSuccess('p1', 'hero-006'))

    expect(openWindows(gs).map((w) => w.getRespondentId())).toEqual(['p2', 'p4']) // p3 fields a Wizard only
    expect(windowOf(gs, 'p2').getOptions()).toEqual(['a'])
    windowOf(gs, 'p4').submitReaction('p4', { choice: 'c' })
    windowOf(gs, 'p2').submitReaction('p2', { choice: 'a' })

    expect(gs.getPlayer('p2')!.getHand()).toEqual([])
    expect(gs.getPlayer('p3')!.getHand()).toEqual(['b'])
    expect(gs.getPlayer('p4')!.getHand()).toEqual([])
    expect(gs.getDiscardPile().getAll()).toEqual(['c', 'a'])
    expect(emitted.filter((e) => e.getType() === GameEventType.CardDiscarded).map((e) => e.getPlayerId())).toEqual(['p2', 'p4'])
    expect(gs.getPipelines()).toEqual([])
  })
})
