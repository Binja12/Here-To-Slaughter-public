import {
  Audience,
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  Owner,
  ReactionWindowType,
  Zone,
} from 'shared'
import { ChooseCardTask, ChoosePlayerTask, ConfirmTask } from './choose-tasks'
import { MagicCard } from '../cards/magic-card'
import { CONFIRM, DISMISS } from '../reactions/task-choice-window'
import { GameState } from '../game-state'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { Player } from '../player'
import { Party } from '../party'
import { HeroCard } from '../cards/hero-card'
import { AbilityContext, CTX_CHOSEN_PLAYER } from '../ability-context'
import { GameEventEmitter } from '../events/game-event-emitter'
import { ReactionManager } from '../reactions/reaction-manager'

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const makeGs = () =>
  new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

const makeHeroCard = (id: string) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'test',
    heroClass: HeroClass.Fighter,
    rollReq: 5,
    ability: undefined as never,
  })

const makeMagicCard = (id: string) =>
  new MagicCard({
    id,
    name: id,
    type: CardType.Magic,
    image: '',
    description: '',
    set: 'test',
  } as never)

function seat(gs: GameState, playerId: string, hand: string[] = []) {
  const player = new Player({
    id: playerId,
    name: playerId,
    hand,
    partyId: `${playerId}-party`,
    actionPoints: 3,
  })
  gs.registerPlayer(player)
  gs.registerParty(
    new Party({
      playerId,
      leaderId: `${playerId}-leader`,
      heroIds: [],
      monsterIds: [],
    }),
  )
  return player
}

const collect = (em: GameEventEmitter): IGameEvent[] => {
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  return events
}

/** The single open window across all frames. */
const openWindow = (gs: GameState) =>
  [...gs.frames.values()].flatMap((f) => f.windows)[0]

const openedPayload = (events: IGameEvent[]) =>
  events
    .find((e) => e.getType() === GameEventType.ReactionWindowOpened)!
    .getPayload() as Record<string, unknown>

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChoosePlayerTask', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('opens a PlayerChoice window offering the other players', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2')
    seat(gs, 'p3')
    const em = new GameEventEmitter()
    const events = collect(em)
    const rm = new ReactionManager(gs, em)

    new ChoosePlayerTask().execute(gs, new AbilityContext('src', 'p1'), em, rm)

    const payload = openedPayload(events)
    expect(payload['windowType']).toBe(ReactionWindowType.PlayerChoice)
    expect(payload['options']).toEqual(['p2', 'p3'])
  })

  it('excludes the ability owner by default', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2')
    const em = new GameEventEmitter()
    const events = collect(em)

    new ChoosePlayerTask().execute(
      gs,
      new AbilityContext('src', 'p1'),
      em,
      new ReactionManager(gs, em),
    )

    expect(openedPayload(events)['options']).not.toContain('p1')
  })

  it('reports the pick through the frame result, like any other window', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2')
    const em = new GameEventEmitter()
    const events = collect(em)

    new ChoosePlayerTask().execute(
      gs,
      new AbilityContext('src', 'p1'),
      em,
      new ReactionManager(gs, em),
    )
    openWindow(gs).submitReaction('p1', { choice: 'p2' })

    const resolved = events.find((e) => e.getType() === GameEventType.FrameResolved)
    expect((resolved!.getPayload() as { results: unknown[] }).results).toEqual(['p2'])
  })

  it('suspends the pipeline by leaving a frame id behind', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2')
    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em)

    new ChoosePlayerTask().execute(gs, new AbilityContext('src', 'p1'), em, rm)

    expect(rm.takeLastFrameId()).toBeTruthy()
  })
})

describe('ChooseCardTask', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('opens a CardChoice window from a declarative filter', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    gs.registerCard(makeHeroCard('card-1'))
    gs.registerCard(makeHeroCard('card-2'))
    gs.getParty('p1').addHero('card-1')
    gs.getParty('p1').addHero('card-2')
    const em = new GameEventEmitter()
    const events = collect(em)

    new ChooseCardTask({ zone: Zone.Party, owner: Owner.Self }).execute(
      gs,
      new AbilityContext('src', 'p1'),
      em,
      new ReactionManager(gs, em),
    )

    const payload = openedPayload(events)
    expect(payload['windowType']).toBe(ReactionWindowType.CardChoice)
    expect(payload['options']).toEqual(['card-1', 'card-2'])
  })

  it('reports the picked card through the frame result', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    gs.registerCard(makeHeroCard('card-1'))
    gs.getParty('p1').addHero('card-1')
    const em = new GameEventEmitter()
    const events = collect(em)

    new ChooseCardTask({ zone: Zone.Party, owner: Owner.Self }).execute(
      gs,
      new AbilityContext('src', 'p1'),
      em,
      new ReactionManager(gs, em),
    )
    openWindow(gs).submitReaction('p1', { choice: 'card-1' })

    const resolved = events.find((e) => e.getType() === GameEventType.FrameResolved)
    expect((resolved!.getPayload() as { results: unknown[] }).results).toEqual(['card-1'])
  })

  // Relevance only: the filter decides what may be PICKED. Who is allowed to
  // SEE these ids is settled by the projection layer in front of the API.
  it('offers only the matching cards from another player’s hand', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    const p2 = seat(gs, 'p2')
    gs.registerCard(makeHeroCard('their-hero'))
    gs.registerCard(makeMagicCard('their-magic'))
    p2.addToHand('their-hero')
    p2.addToHand('their-magic')
    const em = new GameEventEmitter()
    const events = collect(em)

    new ChooseCardTask({
      zone: Zone.Hand,
      owner: Owner.Others,
      cardType: CardType.Magic,
    }).execute(gs, new AbilityContext('src', 'p1'), em, new ReactionManager(gs, em))

    expect(openedPayload(events)['options']).toEqual(['their-magic'])
  })

  it('rejects a pick that was never offered', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    const p2 = seat(gs, 'p2')
    gs.registerCard(makeHeroCard('their-hero'))
    gs.registerCard(makeMagicCard('their-magic'))
    p2.addToHand('their-hero')
    p2.addToHand('their-magic')
    const em = new GameEventEmitter()

    new ChooseCardTask({
      zone: Zone.Hand,
      owner: Owner.Others,
      cardType: CardType.Magic,
    }).execute(gs, new AbilityContext('src', 'p1'), em, new ReactionManager(gs, em))

    openWindow(gs).submitReaction('p1', { choice: 'their-hero' })

    expect(openWindow(gs).isOpen()).toBe(true)
  })
})

describe('ConfirmTask', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('opens a TaskChoice window', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    const em = new GameEventEmitter()
    const events = collect(em)

    new ConfirmTask().execute(
      gs,
      new AbilityContext('src', 'p1'),
      em,
      new ReactionManager(gs, em),
    )

    expect(openedPayload(events)['windowType']).toBe(ReactionWindowType.TaskChoice)
  })

  // DISMISS is the window's failure case, so it rolls the frame back — that
  // rollback is what discards any pipeline suspended on it.
  it('rolls its frame back on DISMISS', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em)

    new ConfirmTask().execute(gs, new AbilityContext('src', 'p1'), em, rm)
    const frameId = rm.takeLastFrameId()!
    gs.abilityPipelines.set(frameId, { steps: [], ctx: new AbilityContext('src', 'p1') })
    openWindow(gs).submitReaction('p1', { choice: DISMISS })

    expect(gs.abilityPipelines.has(frameId)).toBe(false)
  })

  it('keeps the suspended pipeline on CONFIRM', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em)

    new ConfirmTask().execute(gs, new AbilityContext('src', 'p1'), em, rm)
    const frameId = rm.takeLastFrameId()!
    gs.abilityPipelines.set(frameId, { steps: [], ctx: new AbilityContext('src', 'p1') })
    openWindow(gs).submitReaction('p1', { choice: CONFIRM })

    // Present through resolution; AbilityProcessor is what consumes it.
    expect(gs.frames.has(frameId)).toBe(false)
  })

  it('routes the prompt to the ability owner', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    const em = new GameEventEmitter()
    const events = collect(em)

    new ConfirmTask().execute(
      gs,
      new AbilityContext('src', 'p1'),
      em,
      new ReactionManager(gs, em),
    )

    expect(openedPayload(events)['respondentId']).toBe('p1')
  })

  it('accepts CONFIRM from the owner', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em)

    new ConfirmTask().execute(gs, new AbilityContext('src', 'p1'), em, rm)
    const win = openWindow(gs)
    win.submitReaction('p1', { choice: CONFIRM })

    expect(win.isOpen()).toBe(false)
  })
})
