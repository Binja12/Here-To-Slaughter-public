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
import { SmoothMimimeowAbility } from './smooth-mimimeow-ability'

// Smooth Mimimeow (hero-024): "Pull a card from the hand of each other player with a Thief in their Party."

describe('Smooth Mimimeow (hero-024)', () => {
  it('one blind pull from every other Thief seat, nobody asked, no window', () => {
    const gs = makeGs()
    seat(gs, 'p1', ['mine'], ['hero-024'])
    seat(gs, 'p2', ['a'], ['t'])
    seat(gs, 'p3', ['b'], ['w'])
    seat(gs, 'p4', [], ['t2'])
    gs.registerCard(hero('hero-024'))
    gs.registerCard(hero('t', HeroClass.Thief))
    gs.registerCard(hero('t2', HeroClass.Thief))
    gs.registerCard(hero('w', HeroClass.Wizard))
    const { em, emitted, rm } = wire(gs)
    new TaskManager(gs, em, rm, new Map([['hero-024', SmoothMimimeowAbility]]))

    em.emit(GameEventFactory.rollSuccess('p1', 'hero-024'))

    expect(openWindows(gs)).toEqual([])
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['mine', 'a'])
    expect(gs.getPlayer('p2')!.getHand()).toEqual([])
    expect(gs.getPlayer('p3')!.getHand()).toEqual(['b']) // a Wizard only: left alone
    expect(emitted.filter((e) => e.getType() === GameEventType.CardPulled)).toHaveLength(1) // p4 had nothing to pull
    expect(gs.getPipelines()).toEqual([])
  })
})
