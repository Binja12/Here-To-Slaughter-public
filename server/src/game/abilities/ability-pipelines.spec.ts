import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  TriggerScope,
} from 'shared'
import { TaskManager } from '../pipelines/task-manager'
import { GameState } from '../pipelines/game-state'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { HeroCard } from '../cards/hero-card'
import { MagicCard } from '../cards/magic-card'
import { AbilityContext } from './ability-context'
import { IAbilityRule, IReactionManager, ITask } from '../interfaces'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventFactory } from '../events/game-event-factory'
import { GameEvent } from '../events/game-event'
import { ReactionManager } from '../pipelines/reaction-manager'
import { ConfirmTask } from '../tasks/choose-tasks'
import { DrawTask } from '../tasks/draw-task'
import { PlayMagicTask } from '../tasks/magic-tasks'
import { SnowballAbility } from '../repositories/ability-repository/snowball-ability'
import { CONFIRM } from '../reactions/task-choice-window'

// ---------------------------------------------------------------------------
// The pipeline stack — an ability set off by a step finishes before the rest
// of the pipeline that set it off, even when it pauses on a window between.
// ---------------------------------------------------------------------------

const makeMagic = (id: string) =>
  new MagicCard({
    id,
    name: id,
    type: CardType.Magic,
    image: '',
    description: '',
    set: 't',
  })

const makeHero = (id: string) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 't',
    heroClass: HeroClass.Fighter,
    rollReq: 5,
  })

/** Records the order steps run in, and can emit while running. */
const traceTask = (log: string[], label: string, emits?: () => IGameEvent): ITask => ({
  execute: (_gs, _ctx, em) => {
    log.push(label)
    if (emits) em.emit(emits())
  },
})

function setup(deck: string[] = [], heroIds: string[] = []) {
  const stack = new CardStack('deck', 'main')
  for (const c of deck) stack.addToBottom(c)
  const gs = new GameState(
    stack,
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )
  gs.registerPlayer(
    new Player({ id: 'p1', name: 'P1', hand: [], partyId: 'party-1', actionPoints: 3 }),
  )
  gs.registerParty(
    new Party({ playerId: 'p1', leaderId: 'leader-1', heroIds, monsterIds: [] }),
  )
  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  return { gs, em, rm, events }
}

const openWindows = (gs: GameState) =>
  [...gs.frames.values()].flatMap((f) => f.windows).filter((w) => w.isOpen())

const types = (events: IGameEvent[]) => events.map((e) => e.getType())

/** Same shape TurnManager emits. */
const turnStarted = () =>
  new GameEvent(GameEventType.TurnStarted, 'p1', { playerId: 'p1' })

describe('ability pipelines — ordering', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("runs an ability set off by a step before that pipeline's own next step", () => {
    const log: string[] = []
    const { gs, em, rm } = setup([], ['hero-a'])
    gs.registerCard(makeHero('hero-a'))
    gs.registerCard(makeHero('leader-1'))

    const abilities = new Map<string, IAbilityRule[]>([
      [
        'hero-a',
        [
          {
            trigger: { on: GameEventType.TurnStarted, scope: TriggerScope.Anyone },
            steps: [
              traceTask(log, 'outer-1', () =>
                GameEventFactory.heroDestroyed('p1', 'trigger'),
              ),
              traceTask(log, 'outer-2'),
            ],
          },
        ],
      ],
      [
        'leader-1',
        [
          {
            trigger: { on: GameEventType.HeroDestroyed, scope: TriggerScope.Anyone },
            steps: [traceTask(log, 'nested')],
          },
        ],
      ],
    ])
    new TaskManager(gs, em, rm, abilities)

    em.emit(turnStarted())

    // Not outer-1, outer-2, nested: the new pipeline goes on top of this one.
    expect(log).toEqual(['outer-1', 'nested', 'outer-2'])
  })

  it('holds the rest of a pipeline while the ability it set off waits on a window', () => {
    const log: string[] = []
    const { gs, em, rm } = setup([], ['hero-a'])
    gs.registerCard(makeHero('hero-a'))
    gs.registerCard(makeHero('leader-1'))

    const abilities = new Map<string, IAbilityRule[]>([
      [
        'hero-a',
        [
          {
            trigger: { on: GameEventType.TurnStarted, scope: TriggerScope.Anyone },
            steps: [
              traceTask(log, 'outer-1', () =>
                GameEventFactory.heroDestroyed('p1', 'trigger'),
              ),
              traceTask(log, 'outer-2'),
            ],
          },
        ],
      ],
      [
        'leader-1',
        [
          {
            trigger: { on: GameEventType.HeroDestroyed, scope: TriggerScope.Anyone },
            steps: [new ConfirmTask({ confirms: 'Nested' }), traceTask(log, 'nested-tail')],
          },
        ],
      ],
    ])
    new TaskManager(gs, em, rm, abilities)

    em.emit(turnStarted())

    // The nested question is open, so outer-2 must not have run yet.
    expect(log).toEqual(['outer-1'])
    expect(openWindows(gs)).toHaveLength(1)

    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })

    expect(log).toEqual(['outer-1', 'nested-tail', 'outer-2'])
  })

  it('makes a second entry matching the same event wait for the first', () => {
    const log: string[] = []
    const { gs, em, rm } = setup([], ['hero-a'])
    gs.registerCard(makeHero('hero-a'))

    const abilities = new Map<string, IAbilityRule[]>([
      [
        'hero-a',
        [
          {
            trigger: { on: GameEventType.TurnStarted, scope: TriggerScope.Anyone },
            steps: [new ConfirmTask({ confirms: 'First' }), traceTask(log, 'first-tail')],
          },
          {
            trigger: { on: GameEventType.TurnStarted, scope: TriggerScope.Anyone },
            steps: [traceTask(log, 'second')],
          },
        ],
      ],
    ])
    new TaskManager(gs, em, rm, abilities)

    em.emit(turnStarted())

    // The second entry waits: it used to run underneath the first's window.
    expect(log).toEqual([])

    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })

    expect(log).toEqual(['first-tail', 'second'])
  })

  it('does not consume the registry declaration — the same ability fires twice', () => {
    const log: string[] = []
    const { gs, em, rm } = setup([], ['hero-a'])
    gs.registerCard(makeHero('hero-a'))

    const abilities = new Map<string, IAbilityRule[]>([
      [
        'hero-a',
        [
          {
            trigger: { on: GameEventType.TurnStarted, scope: TriggerScope.Anyone },
            steps: [traceTask(log, 'a'), traceTask(log, 'b')],
          },
        ],
      ],
    ])
    new TaskManager(gs, em, rm, abilities)

    em.emit(turnStarted())
    em.emit(turnStarted())

    expect(log).toEqual(['a', 'b', 'a', 'b'])
  })
})

describe('ability pipelines — a played magic card', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const MAGIC_ASKS = 'MagicAsks'

  /**
   * A magic card that PAUSES: asks a question, then draws. Disposal follows
   * the confirm rather than sitting in the continuation, so the card is put
   * away on the DISMISS branch too. TaskConfirmed goes out before the frame
   * resolves, so the continuation still matches from the instance pile.
   */
  const magicAbility = (): IAbilityRule[] => [
    {
      trigger: {
        on: GameEventType.FrameResolved,
        scope: TriggerScope.SelfCard,
      },
      steps: [new ConfirmTask({ confirms: MAGIC_ASKS })],
    },
    {
      trigger: {
        on: GameEventType.TaskConfirmed,
        scope: TriggerScope.SelfCard,
        when: MAGIC_ASKS,
      },
      steps: [new DrawTask(1)],
    },
  ]

  /** Snowball rolls, draws magic-1, and is told to play it and draw again. */
  function playThroughSnowball() {
    const ctx = setup(['magic-1', 'card-2', 'card-3', 'card-4'], ['snowball'])
    ctx.gs.registerCard(makeMagic('magic-1'))
    new TaskManager(
      ctx.gs,
      ctx.em,
      ctx.rm,
      new Map([
        ['snowball', SnowballAbility],
        ['magic-1', magicAbility()],
      ]),
    )
    ctx.em.emit(GameEventFactory.rollSuccess('p1', 'snowball'))
    // Snowball's own prompt: yes, play it and draw.
    openWindows(ctx.gs)[0].submitReaction('p1', { choice: CONFIRM })
    // Then the challenge the play opens on magic-1, uncontested.
    jest.advanceTimersByTime(5000)
    return ctx
  }

  it('holds its instance-pile position until its ability is finished', () => {
    const { gs } = playThroughSnowball()

    // Disposal is the LAST step of the play, below the card's own ability on
    // the stack — so while that ability is still asking its question, the card
    // is still in the position abilitySources() scans.
    expect(gs.getParty('p1').getInstanceCardIds()).toContain('magic-1')
    expect(gs.getDiscardPile().getAll()).not.toContain('magic-1')
  })

  it('still holds the rest of Snowball while the card asks its question', () => {
    const { gs, events } = playThroughSnowball()

    // The card's own question is open, and Snowball's second draw sits under
    // it on the stack.
    expect(openWindows(gs)).toHaveLength(1)
    expect(
      types(events).filter((t) => t === GameEventType.CardDrawn),
    ).toHaveLength(1)

    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })

    expect(
      types(events).filter((t) => t === GameEventType.CardDrawn).length,
    ).toBeGreaterThan(1)
  })

  it('hands off to a continuation entry, like any other card', () => {
    // Its second entry triggers on TaskConfirmed. The card is still in the
    // instance pile when that lands — disposal waits for the whole run — so
    // abilitySources() scans it and the entry matches. This is what the
    // deferred disposal buys; it used to be limitation 8.
    const { gs, events } = playThroughSnowball()

    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })

    // Snowball's two draws, plus the card's own.
    expect(
      types(events).filter((t) => t === GameEventType.CardDrawn),
    ).toHaveLength(3)
    // And only once the continuation is done does the card go.
    expect(gs.getDiscardPile().getAll()).toContain('magic-1')
    expect(gs.getParty('p1').getInstanceCardIds()).not.toContain('magic-1')
    expect(gs.abilityPipelines).toHaveLength(0)
  })

  it('leaves nothing pending when the card declines its own prompt', () => {
    const { gs } = playThroughSnowball()

    jest.advanceTimersByTime(5000) // the card's prompt times out

    expect(gs.getDiscardPile().getAll()).toContain('magic-1')
    expect(gs.abilityPipelines).toHaveLength(0)
  })
})

describe('ability pipelines — rollback', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('drops the paused pipeline but still finishes the ones below it', () => {
    const log: string[] = []
    const { gs, em, rm } = setup([], ['hero-a'])
    gs.registerCard(makeHero('hero-a'))
    gs.registerCard(makeHero('leader-1'))

    /** Opens a frame with no window and hands it back, so the pipeline pauses. */
    class SuspendTask implements ITask {
      execute(
        _gs: GameState,
        _ctx: AbilityContext,
        _em: never,
        reactions: IReactionManager,
      ): string {
        return reactions.openFrame()
      }
    }

    const abilities = new Map<string, IAbilityRule[]>([
      [
        'hero-a',
        [
          {
            trigger: { on: GameEventType.TurnStarted, scope: TriggerScope.Anyone },
            steps: [
              traceTask(log, 'outer-1', () =>
                GameEventFactory.heroDestroyed('p1', 'trigger'),
              ),
              traceTask(log, 'outer-2'),
            ],
          },
        ],
      ],
      [
        'leader-1',
        [
          {
            trigger: { on: GameEventType.HeroDestroyed, scope: TriggerScope.Anyone },
            steps: [new SuspendTask(), traceTask(log, 'nested-tail')],
          },
        ],
      ],
    ])
    new TaskManager(gs, em, rm, abilities)

    em.emit(turnStarted())

    const [frameId] = [...gs.frames.keys()]
    expect(gs.abilityPipelines.filter((r) => r.pausedOn === frameId)).toHaveLength(1)

    // The outcome FAILED: rollback, then announce.
    gs.restoreFrame(frameId)
    em.emit(GameEventFactory.frameResolved(frameId, []))

    // Undoing the frame cancelled what it was waiting for...
    expect(log).not.toContain('nested-tail')
    // ...but the pipeline underneath was in the snapshot, so it lives on.
    expect(log).toEqual(['outer-1', 'outer-2'])
    expect(gs.abilityPipelines).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// AbilityDone — "this CARD's rules are finished", not "a step ran".
//
// The whole instance-disposal design rests on this event arriving exactly once
// and only at the true end of a card's run, so these are the probes for it: a
// card that splits at a question must not be announced done between its halves.
// ---------------------------------------------------------------------------

describe('AbilityDone', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const SPLIT = 'Split'

  const doneFor = (events: IGameEvent[], cardId: string) =>
    events.filter(
      (e) =>
        e.getType() === GameEventType.AbilityDone &&
        (e.getPayload() as { cardId: string }).cardId === cardId,
    )

  /** A card whose run is one straight entry. */
  const oneEntry = (log: string[]): IAbilityRule[] => [
    {
      trigger: { on: GameEventType.TurnStarted, scope: TriggerScope.OwnerEvent },
      steps: [traceTask(log, 'a'), traceTask(log, 'b')],
    },
  ]

  /** A card that splits at a confirm — two entries, two contexts. */
  const confirmSplit = (log: string[]): IAbilityRule[] => [
    {
      trigger: { on: GameEventType.TurnStarted, scope: TriggerScope.OwnerEvent },
      steps: [traceTask(log, 'ask'), new ConfirmTask({ confirms: SPLIT })],
    },
    {
      trigger: {
        on: GameEventType.TaskConfirmed,
        scope: TriggerScope.SelfCard,
        when: SPLIT,
      },
      steps: [traceTask(log, 'after')],
    },
  ]

  it('fires once when a card runs a single entry to the end', () => {
    const log: string[] = []
    const { gs, em, events } = setup([], ['hero-a'])
    gs.registerCard(makeHero('hero-a'))
    new TaskManager(gs, em, {} as IReactionManager, new Map([['hero-a', oneEntry(log)]]), [])

    em.emit(turnStarted())

    expect(log).toEqual(['a', 'b'])
    expect(doneFor(events, 'hero-a')).toHaveLength(1)
  })

  it('does NOT fire between the halves of a card that splits at a question', () => {
    const log: string[] = []
    const { gs, em, rm, events } = setup([], ['hero-a'])
    gs.registerCard(makeHero('hero-a'))
    new TaskManager(gs, em, rm, new Map([['hero-a', confirmSplit(log)]]), [])

    em.emit(turnStarted())
    // Parked on the confirm: entry [0] has no steps left but has not finished.
    expect(doneFor(events, 'hero-a')).toHaveLength(0)

    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })

    expect(log).toEqual(['ask', 'after'])
    expect(doneFor(events, 'hero-a')).toHaveLength(1)
  })

  it('fires once on DISMISS too — the continuation simply never matched', () => {
    const log: string[] = []
    const { gs, em, rm, events } = setup([], ['hero-a'])
    gs.registerCard(makeHero('hero-a'))
    new TaskManager(gs, em, rm, new Map([['hero-a', confirmSplit(log)]]), [])

    em.emit(turnStarted())
    jest.advanceTimersByTime(5000) // the prompt lapses

    expect(log).toEqual(['ask'])
    expect(doneFor(events, 'hero-a')).toHaveLength(1)
  })

  it('announces the parent LAST, after a continuation it set off', () => {
    const log: string[] = []
    const { gs, em, rm, events } = setup([], ['hero-a'])
    gs.registerCard(makeHero('hero-a'))
    new TaskManager(gs, em, rm, new Map([['hero-a', confirmSplit(log)]]), [])

    em.emit(turnStarted())
    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })

    // The continuation is pushed ABOVE its parent, so the parent is popped
    // last — which is what makes "nothing left for this card" mean finished.
    const order = types(events).filter(
      (t) => t === GameEventType.TaskConfirmed || t === GameEventType.AbilityDone,
    )
    expect(order).toEqual([
      GameEventType.TaskConfirmed,
      GameEventType.AbilityDone,
    ])
  })

  it('keeps two cards apart — one finishing says nothing about the other', () => {
    const log: string[] = []
    const { gs, em, rm, events } = setup([], ['hero-a', 'hero-b'])
    gs.registerCard(makeHero('hero-a'))
    gs.registerCard(makeHero('hero-b'))
    new TaskManager(
      gs,
      em,
      rm,
      new Map([
        ['hero-a', oneEntry(log)],
        ['hero-b', confirmSplit(log)],
      ]),
      [],
    )

    em.emit(turnStarted())

    // hero-a is declared first so it goes on top and runs first, straight
    // through. hero-b then parks on its prompt — and everything under a paused
    // pipeline waits, which is why the straight-through card has to be the one
    // that goes first for this to say anything.
    expect(doneFor(events, 'hero-a')).toHaveLength(1)
    expect(doneFor(events, 'hero-b')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// AbilityDone ignores the engine's own housekeeping — on both sides.
//
// A system rule must not ANNOUNCE (the player is told what their card did, not
// what the engine tidied), and must not DELAY the announcement either. Filter
// only one side and a card whose last live pipeline is a system rule is never
// reported done at all.
// ---------------------------------------------------------------------------

describe('AbilityDone and system rules', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const HOUSEKEEPING = 'Housekeeping'

  const doneFor = (events: IGameEvent[], cardId: string) =>
    events.filter(
      (e) =>
        e.getType() === GameEventType.AbilityDone &&
        (e.getPayload() as { cardId: string }).cardId === cardId,
    )

  /** Every card gets this; it parks on a prompt and stays there. */
  const parkingRule: IAbilityRule[] = [
    {
      trigger: { on: GameEventType.TurnStarted, scope: TriggerScope.OwnerEvent },
      steps: [new ConfirmTask({ confirms: HOUSEKEEPING })],
    },
  ]

  it('a system rule parked mid-run does not hold back the card announcement', () => {
    const log: string[] = []
    const { gs, em, rm, events } = setup([], ['hero-a'])
    gs.registerCard(makeHero('hero-a'))
    new TaskManager(
      gs,
      em,
      rm,
      new Map([
        [
          'hero-a',
          [
            {
              trigger: {
                on: GameEventType.TurnStarted,
                scope: TriggerScope.OwnerEvent,
              },
              steps: [traceTask(log, 'printed')],
            },
          ],
        ],
      ]),
      parkingRule,
    )

    em.emit(turnStarted())

    // The card's printed entry ran to the end; the engine's rule is still
    // sitting on a window, and says nothing about what the card did.
    expect(log).toEqual(['printed'])
    expect(openWindows(gs)).toHaveLength(1)
    expect(doneFor(events, 'hero-a')).toHaveLength(1)
  })

  it('a system rule finishing announces nothing on its own', () => {
    const { gs, em, rm, events } = setup([], ['hero-a'])
    gs.registerCard(makeHero('hero-a'))
    // No printed entry at all: the card has behaviour only the engine gave it.
    new TaskManager(gs, em, rm, new Map(), [
      {
        trigger: {
          on: GameEventType.TurnStarted,
          scope: TriggerScope.OwnerEvent,
        },
        steps: [{ execute: () => {} }],
      },
    ])

    em.emit(turnStarted())

    expect(gs.abilityPipelines).toHaveLength(0)
    expect(doneFor(events, 'hero-a')).toHaveLength(0)
  })
})
