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
import { SpookyAbility } from './spooky-ability'

// Spooky (hero-035): "Every opponent sacrifices one of their own heroes."

describe('Spooky (hero-035)', () => {
  it('asks every seat with heroes at once, over its own party, and each sacrifices its pick', () => {
    const gs = makeGs()
    seat(gs, 'p1', [], ['hero-035'])
    seat(gs, 'p2', [], ['h2', 'h2b'])
    seat(gs, 'p3', [], [])
    seat(gs, 'p4', [], ['h4'])
    for (const id of ['hero-035', 'h2', 'h2b', 'h4']) gs.registerCard(hero(id))
    const { em, emitted, rm } = wire(gs)
    new TaskManager(gs, em, rm, new Map([['hero-035', SpookyAbility]]))

    em.emit(GameEventFactory.rollSuccess('p1', 'hero-035'))

    expect(openWindows(gs).map((w) => w.getRespondentId())).toEqual(['p2', 'p4']) // p3 has nobody to give up
    expect(windowOf(gs, 'p2').getOptions()).toEqual(['h2', 'h2b'])
    expect(windowOf(gs, 'p2').getType()).toBe(ReactionWindowType.CardChoice)
    windowOf(gs, 'p2').submitReaction('p2', { choice: 'h2b' })
    windowOf(gs, 'p4').submitReaction('p4', { choice: 'h4' })

    expect(gs.getParty('p2').getHeroIds()).toEqual(['h2'])
    expect(gs.getParty('p4').getHeroIds()).toEqual([])
    expect(gs.getParty('p1').getHeroIds()).toEqual(['hero-035'])
    expect(emitted.filter((e) => e.getType() === GameEventType.HeroSacrificed).map((e) => e.getPlayerId())).toEqual(['p2', 'p4'])
    expect(gs.getPipelines()).toEqual([])
  })
})
