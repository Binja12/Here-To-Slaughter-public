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
import { AbilityContext, CTX_DISCARDED_CARDS, chosenCardOf } from '../../abilities/ability-context'
import { IReactionWindow } from '../../interfaces'
import { BearyWiseAbility } from './beary-wise-ability'

const makeGs = () =>
  new GameState(new CardStack('deck', 'main'), new CardPile('discard', 'discard'), new CardStack('mdeck', 'monster-deck'), new CardPile('mpile', 'monster-pile'))

const seat = (gs: GameState, id: string, hand: string[] = [], heroIds: string[] = []) => {
  gs.registerPlayer(new Player({ id, name: id, hand, partyId: `${id}-party`, actionPoints: 3 }))
  gs.registerParty(new Party({ playerId: id, leaderId: `${id}-leader`, heroIds, monsterIds: [] }))
}

const hero = (id: string) =>
  new HeroCard({ id, name: id, type: CardType.Hero, image: '', description: '', set: 'base', heroClass: HeroClass.Thief, rollReq: 5 })

const openWindows = (gs: GameState): IReactionWindow[] => gs.openWindows()
const windowOf = (gs: GameState, seatId: string) => openWindows(gs).find((w) => w.getRespondentId() === seatId)!

const wire = (gs: GameState) => {
  const em = new GameEventEmitter()
  const emitted: IGameEvent[] = []
  em.addListener({ onEvent: (e) => emitted.push(e) })
  return { em, emitted, rm: new ReactionManager(gs, em) }
}

// Beary Wise (hero-003): "Each other player must DISCARD a card. Choose one
// of the discarded cards and add it to your hand."

describe('Beary Wise (hero-003)', () => {
  it('asks every other seat at once, in one frame; each pick lands in its own slot', () => {
    const gs = makeGs()
    seat(gs, 'p1', ['mine'])
    seat(gs, 'p2', ['a', 'a2'])
    seat(gs, 'p3', ['b'])
    for (const id of ['a', 'a2', 'b', 'mine']) gs.registerCard(hero(id))
    const ctx = new AbilityContext('hero-003', 'p1')
    const { em, emitted, rm } = wire(gs)
    const [ask, discard, choose, retrieve] = BearyWiseAbility[0].steps

    const frameId = ask.execute(gs, ctx, em, rm) as string
    expect(gs.getFrames().size).toBe(1)
    expect(openWindows(gs).map((w) => w.getRespondentId())).toEqual(['p2', 'p3'])
    expect(windowOf(gs, 'p2').getOptions()).toEqual(['a', 'a2'])
    expect(windowOf(gs, 'p3').getOptions()).toEqual(['b'])
    expect(windowOf(gs, 'p2').resultKey()).toBe(chosenCardOf('p2'))

    // p3 answers first: the frame waits for p2
    windowOf(gs, 'p3').submitReaction('p3', { choice: 'b' })
    expect(gs.getFrames().has(frameId)).toBe(true)
    expect(emitted.filter((e) => e.getType() === GameEventType.FrameResolved)).toHaveLength(0)
    windowOf(gs, 'p2').submitReaction('p2', { choice: 'a2' })
    expect(gs.getFrames().has(frameId)).toBe(false)
    const resolved = emitted.filter((e) => e.getType() === GameEventType.FrameResolved)
    expect(resolved).toHaveLength(1)
    // what the TaskManager would file on resume
    const { result } = resolved[0].getPayload() as { result: { key: string; value: string[] }[] }
    expect(result).toEqual([
      { key: chosenCardOf('p2'), value: ['a2'] },
      { key: chosenCardOf('p3'), value: ['b'] },
    ])
    for (const w of result) ctx.set(w.key, w.value)

    discard.execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p2')!.getHand()).toEqual(['a'])
    expect(gs.getPlayer('p3')!.getHand()).toEqual([])
    expect(ctx.get(CTX_DISCARDED_CARDS)).toEqual(['a2', 'b'])
    expect(emitted.filter((e) => e.getType() === GameEventType.CardDiscarded)).toHaveLength(2)

    choose.execute(gs, ctx, em, rm)
    const mine = openWindows(gs)[0]
    expect(mine.getRespondentId()).toBe('p1')
    expect(mine.getOptions()).toEqual(['b', 'a2']) // the pile, top first, limited to the discards
    mine.submitReaction('p1', { choice: 'a2' })
    ctx.set(mine.resultKey() as string, ['a2'])
    retrieve.execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['mine', 'a2'])
    expect(gs.getDiscardPile().getAll()).toEqual(['b'])
  })

  it('through the TaskManager: both seats are asked together, then the owner is offered exactly those', () => {
    const gs = makeGs()
    gs.getDiscardPile().add('old')
    seat(gs, 'p1', ['mine'], ['hero-003'])
    seat(gs, 'p2', ['a'])
    seat(gs, 'p3', ['b'])
    for (const id of ['hero-003', 'old', 'a', 'b', 'mine']) gs.registerCard(hero(id))
    const { em, emitted, rm } = wire(gs)
    new TaskManager(gs, em, rm, new Map([['hero-003', BearyWiseAbility]]))

    em.emit(GameEventFactory.rollSuccess('p1', 'hero-003'))

    expect(openWindows(gs).map((w) => w.getRespondentId()).sort()).toEqual(['p2', 'p3'])
    windowOf(gs, 'p3').submitReaction('p3', { choice: 'b' })
    expect(openWindows(gs).map((w) => w.getRespondentId())).toEqual(['p2']) // still waiting
    windowOf(gs, 'p2').submitReaction('p2', { choice: 'a' })

    const owner = windowOf(gs, 'p1')
    expect(owner.getType()).toBe(ReactionWindowType.CardChoice)
    expect(owner.getOptions()).toEqual(['b', 'a']) // not 'old'
    owner.submitReaction('p1', { choice: 'a' })

    expect(gs.getPlayer('p1')!.getHand()).toEqual(['mine', 'a'])
    expect(gs.getPlayer('p2')!.getHand()).toEqual([])
    expect(gs.getPlayer('p3')!.getHand()).toEqual([])
    expect(gs.getDiscardPile().getAll()).toEqual(['b', 'old'])
    expect(emitted.filter((e) => e.getType() === GameEventType.CardRetrieved)).toHaveLength(1)
    expect(gs.getPipelines()).toEqual([])
  })

  it('a seat with no hand settles on its own; the owner chooses among what the others discarded', () => {
    jest.useFakeTimers()
    try {
      const gs = makeGs()
      seat(gs, 'p1', [], ['hero-003'])
      seat(gs, 'p2', ['a'])
      seat(gs, 'p3', [])
      for (const id of ['hero-003', 'a']) gs.registerCard(hero(id))
      const { em, rm } = wire(gs)
      new TaskManager(gs, em, rm, new Map([['hero-003', BearyWiseAbility]]))

      em.emit(GameEventFactory.rollSuccess('p1', 'hero-003'))
      expect(windowOf(gs, 'p3').getOptions()).toEqual([])
      jest.advanceTimersByTime(0) // the empty window's 0ms clock
      expect(openWindows(gs).map((w) => w.getRespondentId())).toEqual(['p2'])
      windowOf(gs, 'p2').submitReaction('p2', { choice: 'a' })

      const owner = windowOf(gs, 'p1')
      expect(owner.getOptions()).toEqual(['a'])
      owner.submitReaction('p1', { choice: 'a' })
      expect(gs.getPlayer('p1')!.getHand()).toEqual(['a'])
    } finally {
      jest.useRealTimers()
    }
  })

  it('nobody able to discard: the owner is asked over nothing and takes nothing', () => {
    jest.useFakeTimers()
    try {
      const gs = makeGs()
      gs.getDiscardPile().add('old')
      seat(gs, 'p1', ['mine'], ['hero-003'])
      seat(gs, 'p2', [])
      for (const id of ['hero-003', 'old', 'mine']) gs.registerCard(hero(id))
      const { em, rm } = wire(gs)
      new TaskManager(gs, em, rm, new Map([['hero-003', BearyWiseAbility]]))
      em.emit(GameEventFactory.rollSuccess('p1', 'hero-003'))
      jest.runOnlyPendingTimers() // p2's empty window
      expect(windowOf(gs, 'p1').getOptions()).toEqual([])
      jest.runOnlyPendingTimers() // and the owner's
      expect(gs.getPlayer('p1')!.getHand()).toEqual(['mine'])
      expect(gs.getPipelines()).toEqual([])
    } finally {
      jest.useRealTimers()
    }
  })
})
