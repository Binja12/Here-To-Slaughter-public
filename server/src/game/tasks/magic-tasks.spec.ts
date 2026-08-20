import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  ReactionWindowType,
  TriggerScope,
} from 'shared'
import { PlayMagicTask } from './magic-tasks'
import { ConfirmTask } from './choose-tasks'
import { GameState } from '../pipelines/game-state'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { HeroCard } from '../cards/hero-card'
import { MagicCard } from '../cards/magic-card'
import { AbilityContext, CTX_CHOSEN_CARD, CTX_DRAWN_CARD_IDS } from '../abilities/ability-context'
import { IAbilityRule } from '../interfaces'
import { GameEventEmitter } from '../events/game-event-emitter'
import { ReactionManager } from '../pipelines/reaction-manager'
import { TaskManager } from '../pipelines/task-manager'

// --- Helpers ---

const makeGs = () =>
  new GameState(
    new CardStack('deck-1', 'main-deck'),
    new CardPile('discard pile', 'discard pile'),
    new CardStack('monster deck', 'main monster deck'),
    new CardPile('slayable monsters', 'monster pile'),
  )

const makePlayer = (id: string, hand: string[] = [], ap = 3) =>
  new Player({
    id,
    name: `Player ${id}`,
    hand,
    partyId: `party-${id}`,
    actionPoints: ap,
  })

const makeParty = (playerId: string) =>
  new Party({
    playerId,
    leaderId: `leader-${playerId}`,
    heroIds: [],
    monsterIds: [],
  })

const makeMagicCard = (id: string) =>
  new MagicCard({
    id,
    name: `Magic ${id}`,
    type: CardType.Magic,
    image: '',
    description: '',
    set: '',
  })

/**
 * How a magic card is authored: behaviour bound by card id, triggered by the
 * settled play. Nothing about disposal — the card leaves the instance pile
 * when its run ends, which instance-rules.ts works out on its own.
 */
const magicAbility = (steps: IAbilityRule['steps']): IAbilityRule => ({
  trigger: {
    on: GameEventType.FrameResolved,
    scope: TriggerScope.SelfCard,
  },
  steps: [...steps],
})

/** A card that does nothing at all, but is still registered. */
const noSteps = (): IAbilityRule[] => [magicAbility([])]

const spyAbility = (taskSpy: jest.Mock): IAbilityRule[] => [
  magicAbility([{ execute: () => taskSpy() }]),
]

const openChallenge = (gs: GameState) =>
  [...gs.frames.values()]
    .flatMap((f) => f.windows)
    .find((w) => w.getType() === ReactionWindowType.Challenge && w.isOpen())

// Math.random mock guide — see challenge-window.spec.ts. startChallenge draws
// the challenger's roll first, the defender's second; 0 gives 1, 0.99 gives 11.
const CHALLENGER_WINS: [number, number] = [0.99, 0]
const DEFENDER_WINS: [number, number] = [0, 0.99]

// ---------------------------------------------------------------------------
// PlayMagicTask — the same mechanic as PlayMagicAction, discovered at runtime
// instead of constructed with its target.
// ---------------------------------------------------------------------------

describe('PlayMagicTask', () => {
  let emitter: GameEventEmitter
  let emitted: IGameEvent[]
  let gs: GameState
  let player: Player
  let rm: ReactionManager

  beforeEach(() => {
    jest.useFakeTimers()
    emitter = new GameEventEmitter()
    emitted = []
    emitter.addListener({ onEvent: (e) => emitted.push(e) })
    gs = makeGs()
    player = makePlayer('p1', ['magic-1'])
    gs.registerPlayer(player)
    gs.registerParty(makeParty('p1'))
    gs.registerPlayer(makePlayer('p2'))
    gs.registerParty(makeParty('p2'))
    gs.registerCard(makeMagicCard('magic-1'))
    rm = new ReactionManager(gs, emitter)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  const ctxWith = (slot?: string[], key = CTX_DRAWN_CARD_IDS) => {
    const ctx = new AbilityContext('src-card', 'p1')
    if (slot) ctx.set(key, slot)
    return ctx
  }

  /**
   * A processor must be listening: the played card's steps are what carry it
   * to the discard, and only TaskManager runs those.
   */
  const withTaskManager = (abilities: Map<string, IAbilityRule[]> = new Map()) =>
    new TaskManager(gs, emitter, rm, abilities)

  const run = (task: PlayMagicTask, ctx: AbilityContext) =>
    task.execute(gs, ctx, emitter, rm)

  /** Nobody spends a challenge card: the window times out uncontested. */
  const unchallenged = () => jest.advanceTimersByTime(5000)

  const challengedBy = (rolls: [number, number]) => {
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(rolls[0])
      .mockReturnValueOnce(rolls[1])
    openChallenge(gs)!.submitReaction('p2', {
      type: 'challenge',
      challengerId: 'p2',
    })
    jest.advanceTimersByTime(5000)
  }

  const types = () => emitted.map((e) => e.getType())

  // --- Announce, then the window ---

  it('takes the card out of hand and opens a challenge window on it', () => {
    withTaskManager(new Map([['magic-1', noSteps()]]))

    run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith(['magic-1']))

    expect(player.getHand()).not.toContain('magic-1')
    const window = openChallenge(gs)
    expect(window).toBeDefined()
    expect(window!.subjectCardId!()).toBe(
      'magic-1',
    )
  })

  it('returns the frameId, so the rest of the entry waits on the same window', () => {
    withTaskManager(new Map([['magic-1', noSteps()]]))

    const frameId = run(
      new PlayMagicTask(CTX_DRAWN_CARD_IDS),
      ctxWith(['magic-1']),
    )

    expect(typeof frameId).toBe('string')
    expect(gs.frames.has(frameId as string)).toBe(true)
  })

  it('announces the play from the instance pile — that is what gets challenged', () => {
    const spy = jest.fn()
    withTaskManager(new Map([['magic-1', spyAbility(spy)]]))

    run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith(['magic-1']))

    expect(types()).toEqual([
      GameEventType.CardRemovedFromHand,
      GameEventType.MagicPlayed,
      GameEventType.ReactionWindowOpened,
    ])
    expect(gs.getParty('p1').getInstanceCardIds()).toContain('magic-1')
    // MagicPlayed is the attempt; the card's own steps wait for the outcome.
    expect(spy).not.toHaveBeenCalled()
    expect(gs.getDiscardPile().getAll()).not.toContain('magic-1')
  })

  // --- Won ---

  it('plays the card named by the slot: hand to discard, via the instance pile', () => {
    withTaskManager(new Map([['magic-1', noSteps()]]))

    run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith(['magic-1']))
    unchallenged()

    expect(player.getHand()).not.toContain('magic-1')
    expect(gs.getDiscardPile().getAll()).toContain('magic-1')
    expect(gs.getParty('p1').getInstanceCardIds()).not.toContain('magic-1')
  })

  it('disposal is silent — MagicPlayed already reported the card spent', () => {
    withTaskManager(new Map([['magic-1', noSteps()]]))

    run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith(['magic-1']))
    unchallenged()

    expect(types()).not.toContain(GameEventType.CardDiscarded)
  })

  it("runs the played card's own steps once the challenge settles", () => {
    const spy = jest.fn()
    withTaskManager(new Map([['magic-1', spyAbility(spy)]]))

    run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith(['magic-1']))
    expect(spy).not.toHaveBeenCalled()

    unchallenged()

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('survives a challenge it wins, and cannot be challenged again this turn', () => {
    const spy = jest.fn()
    withTaskManager(new Map([['magic-1', spyAbility(spy)]]))

    run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith(['magic-1']))
    challengedBy(DEFENDER_WINS)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(gs.getDiscardPile().getAll()).toContain('magic-1')
    expect(gs.getCardsChallengedThisTurn()).toContain('magic-1')
  })

  it('holds its instance-pile position while its steps are still resolving', () => {
    // Disposal is the last step, so the card still sits in the pile
    // abilitySources() scans while its own prompt is open.
    withTaskManager(
      new Map([
        ['magic-1', [magicAbility([new ConfirmTask({ confirms: 'MagicAsks' })])]],
      ]),
    )

    run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith(['magic-1']))
    unchallenged()

    expect(gs.getParty('p1').getInstanceCardIds()).toContain('magic-1')
    expect(gs.getDiscardPile().getAll()).not.toContain('magic-1')
  })

  // --- Lost ---

  it('a lost challenge discards the card and runs none of its steps', () => {
    const spy = jest.fn()
    withTaskManager(new Map([['magic-1', spyAbility(spy)]]))

    run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith(['magic-1']))
    challengedBy(CHALLENGER_WINS)

    // Rolled back out of the instance pile, so it is not a source when
    // the settled frame is matched.
    expect(spy).not.toHaveBeenCalled()
    expect(gs.getParty('p1').getInstanceCardIds()).not.toContain('magic-1')
    // Out of hand before the snapshot; ChallengeWindow puts it in the discard.
    expect(player.getHand()).not.toContain('magic-1')
    expect(gs.getDiscardPile().getAll()).toContain('magic-1')
  })

  it('leaves nothing pending after a lost challenge', () => {
    withTaskManager(new Map([['magic-1', noSteps()]]))

    run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith(['magic-1']))
    challengedBy(CHALLENGER_WINS)

    expect(gs.abilityPipelines).toHaveLength(0)
    expect(gs.frames.size).toBe(0)
  })

  // --- What the instance pile still cannot do ---

  it('LIMITATION: a card with no entry is left in the instance pile', () => {
    // Disposal hangs off AbilityDone, and that is emitted when a PIPELINE
    // leaves the stack. A card with no registry entry never gets a pipeline,
    // so nothing ever announces it finished. Documented in section 8.
    withTaskManager()

    run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith(['magic-1']))
    unchallenged()

    expect(gs.getParty('p1').getInstanceCardIds()).toContain('magic-1')
    expect(gs.getDiscardPile().getAll()).not.toContain('magic-1')
  })

  // --- Guards, all before the window opens ---

  it('throws when nothing has written the slot — a mis-declared ability', () => {
    expect(() => run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith())).toThrow(
      CTX_DRAWN_CARD_IDS,
    )
  })

  it('skips an empty slot — the step ahead ran and produced nothing', () => {
    run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith([]))

    expect(emitted).toHaveLength(0)
    expect(gs.frames.size).toBe(0)
  })

  it('skips a card that is not Magic', () => {
    gs.registerCard(
      new HeroCard({
        id: 'hero-1',
        name: 'Hero',
        type: CardType.Hero,
        image: '',
        description: '',
        set: '',
        heroClass: HeroClass.Fighter,
        rollReq: 5,
      }),
    )
    player.addToHand('hero-1')

    run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith(['hero-1']))

    expect(emitted).toHaveLength(0)
    expect(player.getHand()).toContain('hero-1')
  })

  it('skips a card that has left the hand since the slot was written', () => {
    player.removeFromHand('magic-1')

    run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith(['magic-1']))

    expect(emitted).toHaveLength(0)
  })

  it('defaults to the chosen-card slot', () => {
    withTaskManager(new Map([['magic-1', noSteps()]]))

    run(new PlayMagicTask(), ctxWith(['magic-1'], CTX_CHOSEN_CARD))

    expect(player.getHand()).not.toContain('magic-1')
  })
})
