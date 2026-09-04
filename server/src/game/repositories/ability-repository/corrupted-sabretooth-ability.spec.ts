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
import { PassiveType } from 'shared'
import { CorruptedSabretoothAbility } from './corrupted-sabretooth-ability'
import { BadAxeAbility } from './bad-axe-ability'
import { DESTROY_ANYWAY, STEAL_INSTEAD } from '../../tasks/hero-tasks'

// Corrupted Sabretooth (monster-122): "Each time you would DESTROY a Hero
// card, you may STEAL that Hero card instead."

/** p1 slew the Sabretooth and fields Bad Axe; p2 has a hero. Bad Axe rolls. */
function table() {
  const gs = makeGs()
  seat(gs, 'p1', [], ['hero-001'], ['monster-122'])
  seat(gs, 'p2', [], ['theirs'])
  gs.registerCard(hero('hero-001'))
  gs.registerCard(hero('theirs'))
  gs.addEffect({ id: 'saber', sourceCardId: 'monster-122', ownerId: 'p1', type: PassiveType.StealsInsteadOfDestroy })
  const { em, emitted, rm } = wire(gs)
  new TaskManager(gs, em, rm, new Map([['monster-122', CorruptedSabretoothAbility], ['hero-001', BadAxeAbility]]))
  em.emit(GameEventFactory.rollSuccess('p1', 'hero-001'))
  windowOf(gs, 'p1').submitReaction('p1', { choice: 'theirs' }) // Bad Axe's pick
  return { gs, emitted }
}

describe('Corrupted Sabretooth (monster-122)', () => {
  it('fires when it is slain and installs StealsInsteadOfDestroy on the slayer, no clock', () => {
    expect(CorruptedSabretoothAbility[0].trigger.on).toBe(GameEventType.MonsterSlain)
    const gs = makeGs()
    seat(gs, 'p1')
    const { em, rm } = wire(gs)
    for (const step of CorruptedSabretoothAbility[0].steps) step.execute(gs, new AbilityContext('monster-122', 'p1'), em, rm)
    const [effect] = gs.getEffects(PassiveType.StealsInsteadOfDestroy, 'p1')
    expect(effect).toMatchObject({ ownerId: 'p1', sourceCardId: 'monster-122' })
    expect(effect.expiry).toBeUndefined()
  })

  it('the destroy pauses on the question; "steal it instead" steals', () => {
    const { gs, emitted } = table()
    const ask = windowOf(gs, 'p1')
    expect(ask.getType()).toBe(ReactionWindowType.TaskChoice)
    expect(ask.getOptions()).toEqual([STEAL_INSTEAD, DESTROY_ANYWAY])
    expect(gs.getParty('p2').getHeroIds()).toEqual(['theirs'])

    ask.submitReaction('p1', { choice: STEAL_INSTEAD })

    expect(gs.getParty('p1').getHeroIds()).toEqual(['hero-001', 'theirs'])
    expect(gs.getParty('p2').getHeroIds()).toEqual([])
    const types = emitted.map((e) => e.getType())
    expect(types).toContain(GameEventType.HeroStolen)
    expect(types).not.toContain(GameEventType.HeroDestroyed)
    expect(gs.abilityPipelines).toEqual([])
  })

  it('"destroy it" destroys as printed, and is not asked twice', () => {
    const { gs, emitted } = table()
    windowOf(gs, 'p1').submitReaction('p1', { choice: DESTROY_ANYWAY })
    expect(openWindows(gs)).toEqual([])
    expect(gs.getParty('p2').getHeroIds()).toEqual([])
    expect(gs.getDiscardPile().getAll()).toEqual(['theirs'])
    expect(emitted.filter((e) => e.getType() === GameEventType.TaskConfirmed)).toHaveLength(1)
    expect(emitted.map((e) => e.getType())).toContain(GameEventType.HeroDestroyed)
    expect(gs.abilityPipelines).toEqual([])
  })

  it('silence destroys, as printed', () => {
    jest.useFakeTimers()
    try {
      const { gs } = table()
      jest.runOnlyPendingTimers()
      expect(gs.getDiscardPile().getAll()).toEqual(['theirs'])
      expect(gs.getParty('p1').getHeroIds()).toEqual(['hero-001'])
    } finally {
      jest.useRealTimers()
    }
  })
})
