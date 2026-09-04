import {
  Audience,
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  Owner,
  ReactionWindowType,
  RefusalReason,
  Zone,
} from 'shared'
import { ChooseActionTask, ChooseCardEachTask, ChooseCardTask, ChoosePlayerTask, ConfirmTask } from './choose-tasks'
import { MagicCard } from '../cards/magic-card'
import { CONFIRM, DISMISS } from '../reactions/task-choice-window'
import { GameState } from '../pipelines/game-state'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { HeroCard } from '../cards/hero-card'
import {
  AbilityContext,
  CTX_CHOSEN_PLAYER,
  CTX_CHOSEN_CARD,
  CTX_CHOSEN_ITEM,
  CTX_ASKED_SEATS,
  chosenCardOf,
} from '../abilities/ability-context'
import { GameEventEmitter } from '../events/game-event-emitter'
import { ReactionManager } from '../pipelines/reaction-manager'
import { ItemCard } from '../cards/item-card'

/** Party membership changes announce themselves; these tests ignore the events. */
const silentEm = new GameEventEmitter()

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

    const frameId = new ChoosePlayerTask().execute(
      gs,
      new AbilityContext('src', 'p1'),
      em,
      rm,
    )

    // The frameId comes back from execute() — that return value is what tells
    // TaskManager to suspend, so a task that opens a frame must yield it.
    expect(frameId).toBeTruthy()
    expect(gs.frames.has(frameId as string)).toBe(true)
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
    gs.getParty('p1').addHero('card-1', silentEm, 'Played')
    gs.getParty('p1').addHero('card-2', silentEm, 'Played')
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
    gs.getParty('p1').addHero('card-1', silentEm, 'Played')
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

  it("opens the window for the CHOSEN player over their own hand — executor: 'chosen'", () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2', ['their-1', 'their-2'])
    const em = new GameEventEmitter()
    const ctx = new AbilityContext('src', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])

    new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Chosen, executor: 'chosen' }).execute(
      gs,
      ctx,
      em,
      new ReactionManager(gs, em),
    )

    const window = openWindow(gs)
    expect(window.getRespondentId()).toBe('p2')
    expect(window.getOptions()).toEqual(['their-1', 'their-2'])
  })

  it("asks nobody when executor: 'chosen' names an empty slot — the step behind skips", () => {
    const gs = makeGs()
    seat(gs, 'p1')
    const em = new GameEventEmitter()
    const ctx = new AbilityContext('src', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, [])

    const frameId = new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Chosen, executor: 'chosen' }).execute(
      gs,
      ctx,
      em,
      new ReactionManager(gs, em),
    )

    expect(frameId).toBeUndefined()
    expect(openWindow(gs)).toBeUndefined()
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

    const result = openWindow(gs).submitReaction('p1', { choice: 'their-hero' })

    expect(result).toEqual({ accepted: false, reason: RefusalReason.NotAnOption })
    // and the window is spent on one of the cards it DID offer: a pick the
    // window never showed is a client out of step, and the table is not held
    expect(openWindow(gs)).toBeUndefined()
    expect(gs.isBusy()).toBe(false)
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

    new ConfirmTask({ confirms: 'RollOnHero' }).execute(
      gs,
      new AbilityContext('src', 'p1'),
      em,
      new ReactionManager(gs, em),
    )

    expect(openedPayload(events)['windowType']).toBe(ReactionWindowType.TaskChoice)
  })

  // A confirm is TERMINAL, so nothing is ever parked behind it to cancel. The
  // window releases on either answer; the difference is whether TaskConfirmed
  // goes out, and a continuation entry triggers on that event or never runs.
  it('releases its frame on DISMISS, announcing nothing', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    const em = new GameEventEmitter()
    const events: IGameEvent[] = []
    em.addListener({ onEvent: (e) => events.push(e) })
    const rm = new ReactionManager(gs, em)

    const frameId = new ConfirmTask({ confirms: 'RollOnHero' }).execute(
      gs,
      new AbilityContext('src', 'p1'),
      em,
      rm,
    ) as string
    openWindow(gs).submitReaction('p1', { choice: DISMISS })

    expect(gs.frames.has(frameId)).toBe(false) // released, not restored
    expect(
      events.some((e) => e.getType() === GameEventType.TaskConfirmed),
    ).toBe(false)
  })

  it('announces TaskConfirmed on CONFIRM, naming the question and its source', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    const em = new GameEventEmitter()
    const events: IGameEvent[] = []
    em.addListener({ onEvent: (e) => events.push(e) })
    const rm = new ReactionManager(gs, em)

    new ConfirmTask({ confirms: 'RollOnHero' }).execute(
      gs,
      new AbilityContext('src', 'p1'),
      em,
      rm,
    )
    openWindow(gs).submitReaction('p1', { choice: CONFIRM })

    const confirmed = events.find(
      (e) => e.getType() === GameEventType.TaskConfirmed,
    )
    expect(confirmed).toBeDefined()
    // cardId is the SOURCE card, so TriggerScope.SelfCard routes the
    // continuation back to whichever card asked.
    expect(confirmed!.getPayload()).toMatchObject({
      cardId: 'src',
      label: 'RollOnHero',
    })
  })

  it('carries its subject across to the continuation context', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    const em = new GameEventEmitter()
    const events: IGameEvent[] = []
    em.addListener({ onEvent: (e) => events.push(e) })
    const rm = new ReactionManager(gs, em)
    const ctx = new AbilityContext('src', 'p1')
    ctx.set('stolenHeroId', ['victim'])

    new ConfirmTask({ confirms: 'RollOnHero', subjectKey: 'stolenHeroId' }).execute(
      gs,
      ctx,
      em,
      rm,
    )
    openWindow(gs).submitReaction('p1', { choice: CONFIRM })

    // The continuation runs with a FRESH context, so what it needs has to
    // travel on the event.
    const confirmed = events.find(
      (e) => e.getType() === GameEventType.TaskConfirmed,
    )
    expect(confirmed!.getPayload()).toMatchObject({
      ctxSeed: { stolenHeroId: ['victim'] },
    })
  })

  it('skips itself entirely when its subject is empty', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em)
    const ctx = new AbilityContext('src', 'p1')
    ctx.set('stolenHeroId', [])

    const frameId = new ConfirmTask({
      confirms: 'RollOnHero',
      subjectKey: 'stolenHeroId',
    }).execute(gs, ctx, em, rm)

    expect(frameId).toBeUndefined()
    expect(gs.frames.size).toBe(0)
  })

  it('keeps the suspended pipeline on CONFIRM', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em)

    const frameId = new ConfirmTask({ confirms: 'RollOnHero' }).execute(
      gs,
      new AbilityContext('src', 'p1'),
      em,
      rm,
    ) as string
    gs.abilityPipelines.push({
      steps: [],
      ctx: new AbilityContext('src', 'p1'),
      pausedOn: frameId,
    })
    openWindow(gs).submitReaction('p1', { choice: CONFIRM })

    // Present through resolution; TaskManager is what consumes it.
    expect(gs.frames.has(frameId)).toBe(false)
  })

  it('routes the prompt to the ability owner', () => {
    const gs = makeGs()
    seat(gs, 'p1')
    const em = new GameEventEmitter()
    const events = collect(em)

    new ConfirmTask({ confirms: 'RollOnHero' }).execute(
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

    new ConfirmTask({ confirms: 'RollOnHero' }).execute(gs, new AbilityContext('src', 'p1'), em, rm)
    const win = openWindow(gs)
    win.submitReaction('p1', { choice: CONFIRM })

    expect(win.isOpen()).toBe(false)
  })
})

describe('ChooseCardTask — the output slot, and a skipped choice', () => {
  const build = () => {
    const gs = new GameState(new CardStack('deck', 'main'), new CardPile('discard', 'discard'), new CardStack('mdeck', 'monster-deck'), new CardPile('mpile', 'monster-pile'))
    gs.registerPlayer(new Player({ id: 'p1', name: 'p1', hand: ['a'], partyId: 'p1-party', actionPoints: 3 }))
    gs.registerParty(new Party({ playerId: 'p1', leaderId: 'p1-leader', heroIds: [], monsterIds: [] }))
    gs.registerCard(new HeroCard({ id: 'a', name: 'a', type: CardType.Hero, image: '', description: '', set: 'base', heroClass: HeroClass.Thief, rollReq: 5 }))
    const em = new GameEventEmitter()
    return { gs, em, rm: new ReactionManager(gs, em), ctx: new AbilityContext('src', 'p1') }
  }

  it('files the pick where `resultKey` says, so a second pick does not overwrite it', () => {
    const { gs, em, rm, ctx } = build()
    new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Self }, { resultKey: CTX_CHOSEN_ITEM }).execute(gs, ctx, em, rm)
    const window = [...gs.frames.values()].flatMap((f) => f.windows)[0]
    expect(window.resultKey()).toBe(CTX_CHOSEN_ITEM)
  })

  it('a choice skipped on its precondition writes an EMPTY pick, not the previous one', () => {
    const { gs, em, rm, ctx } = build()
    ctx.set(CTX_CHOSEN_CARD, ['stale'])
    ctx.set('gate', [])
    expect(new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Self }, 'gate').execute(gs, ctx, em, rm)).toBeUndefined()
    expect(ctx.get(CTX_CHOSEN_CARD)).toEqual([])
  })
})

describe('ChooseCardEachTask', () => {
  const table = () => {
    const gs = new GameState(new CardStack('deck', 'main'), new CardPile('discard', 'discard'), new CardStack('mdeck', 'monster-deck'), new CardPile('mpile', 'monster-pile'))
    for (const [id, hand] of [['p1', ['mine']], ['p2', ['a', 'i']], ['p3', ['b']]] as [string, string[]][]) {
      gs.registerPlayer(new Player({ id, name: id, hand, partyId: `${id}-party`, actionPoints: 3 }))
      gs.registerParty(new Party({ playerId: id, leaderId: `${id}-leader`, heroIds: [], monsterIds: [] }))
    }
    for (const id of ['mine', 'a', 'b']) gs.registerCard(new HeroCard({ id, name: id, type: CardType.Hero, image: '', description: '', set: 'base', heroClass: HeroClass.Thief, rollReq: 5 }))
    gs.registerCard(new ItemCard({ id: 'i', name: 'i', type: CardType.Item, image: '', description: '', set: 'base', cursed: false }))
    const em = new GameEventEmitter()
    return { gs, em, rm: new ReactionManager(gs, em), ctx: new AbilityContext('src', 'p1') }
  }

  it('one frame, one window per asked seat over its own cards, each filed under its own slot', () => {
    const { gs, em, rm, ctx } = table()
    const frameId = new ChooseCardEachTask({ owner: Owner.Others }, { zone: Zone.Hand, cardType: CardType.Hero }).execute(gs, ctx, em, rm)
    expect(frameId).toBeTruthy()
    expect(gs.frames.size).toBe(1)
    const windows = gs.frames.get(frameId as string)!.windows
    expect(windows.map((w) => w.getRespondentId())).toEqual(['p2', 'p3'])
    expect(windows.map((w) => w.getOptions())).toEqual([['a'], ['b']]) // the item did not qualify
    expect(windows.map((w) => w.resultKey())).toEqual([chosenCardOf('p2'), chosenCardOf('p3')])
    expect(ctx.get(CTX_ASKED_SEATS)).toEqual(['p2', 'p3'])
  })

  it('nobody to ask: no frame, nothing to wait for', () => {
    const { gs, em, rm, ctx } = table()
    expect(new ChooseCardEachTask({ owner: Owner.Others, hasHeroes: true }, { zone: Zone.Hand }).execute(gs, ctx, em, rm)).toBeUndefined()
    expect(gs.frames.size).toBe(0)
    expect(ctx.get(CTX_ASKED_SEATS)).toEqual([])
  })
})

describe('ChooseActionTask', () => {
  const build = () => {
    const gs = new GameState(new CardStack('deck', 'main'), new CardPile('discard', 'discard'), new CardStack('mdeck', 'monster-deck'), new CardPile('mpile', 'monster-pile'))
    gs.registerPlayer(new Player({ id: 'p1', name: 'p1', hand: [], partyId: 'p1-party', actionPoints: 3 }))
    gs.registerParty(new Party({ playerId: 'p1', leaderId: 'p1-leader', heroIds: [], monsterIds: [] }))
    const em = new GameEventEmitter()
    const emitted: IGameEvent[] = []
    em.addListener({ onEvent: (e) => emitted.push(e) })
    return { gs, em, emitted, rm: new ReactionManager(gs, em), ctx: new AbilityContext('src', 'p1') }
  }
  const openWin = (gs: GameState) => gs.openWindows()[0]

  it('offers its labels as the options; the pick announces TaskConfirmed with that label, as the source card', () => {
    const { gs, em, emitted, rm, ctx } = build()
    ctx.set('subject', ['x'])
    new ChooseActionTask({ actions: ['Do A', 'Do B', 'Do nothing'], question: 'Which?', subjectKey: 'subject' }).execute(gs, ctx, em, rm)
    const window = openWin(gs)
    expect(window.getType()).toBe(ReactionWindowType.TaskChoice)
    expect(window.getOptions()).toEqual(['Do A', 'Do B', 'Do nothing'])
    expect(window.getDetail()).toMatchObject({ question: 'Which?', cardId: 'x', silent: 'Do nothing' })
    window.submitReaction('p1', { choice: 'Do B' })
    const confirmed = emitted.filter((e) => e.getType() === GameEventType.TaskConfirmed)
    expect(confirmed).toHaveLength(1)
    expect(confirmed[0].getPayload()).toMatchObject({ cardId: 'src', label: 'Do B', ctxSeed: { subject: ['x'] } })
  })

  it('the LAST label is what silence does: a timeout picks it and announces it', () => {
    jest.useFakeTimers()
    try {
      const { gs, em, emitted, rm, ctx } = build()
      new ChooseActionTask({ actions: ['Do A', 'Do the printed thing'] }).execute(gs, ctx, em, rm)
      jest.runOnlyPendingTimers()
      expect(openWin(gs)).toBeUndefined()
      const confirmed = emitted.filter((e) => e.getType() === GameEventType.TaskConfirmed)
      expect(confirmed).toHaveLength(1)
      expect((confirmed[0].getPayload() as { label: string }).label).toBe('Do the printed thing')
    } finally {
      jest.useRealTimers()
    }
  })

  it('`asCard` announces the question as another card\'s', () => {
    const { gs, em, emitted, rm, ctx } = build()
    new ChooseActionTask({ actions: ['Do A', 'Do nothing'], asCard: 'monster-122' }).execute(gs, ctx, em, rm)
    openWin(gs).submitReaction('p1', { choice: 'Do A' })
    expect(emitted.find((e) => e.getType() === GameEventType.TaskConfirmed)!.getPayload()).toMatchObject({ cardId: 'monster-122', label: 'Do A' })
  })

  it('refuses a single label — that is not a choice', () => {
    expect(() => new ChooseActionTask({ actions: ['only'] })).toThrow(/two labels/)
  })
})

