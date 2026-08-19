import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  TriggerScope,
} from 'shared'
import { PlayMagicTask } from './action-tasks'
import { GameState } from '../game-state'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { HeroCard } from '../cards/hero-card'
import { MagicCard } from '../cards/magic-card'
import { AbilityContext, CTX_CHOSEN_CARD, CTX_DRAWN_CARD_IDS } from '../ability-context'
import { IAbility } from '../interfaces'
import { GameEventEmitter } from '../events/game-event-emitter'
import { ReactionManager } from '../reactions/reaction-manager'
import { TaskManager } from '../task-manager'

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

/** Behaviour is bound by card id in the registry, never on the card's data. */
const spyAbility = (taskSpy: jest.Mock): IAbility => ({
  trigger: { on: GameEventType.MagicPlayed, scope: TriggerScope.SelfCard },
  steps: [{ execute: () => taskSpy() }],
})

// ---------------------------------------------------------------------------
// PlayMagicTask — the same mechanic as PlayMagicAction, discovered at runtime
// instead of constructed with its target.
// ---------------------------------------------------------------------------

describe('PlayMagicTask', () => {
  let emitter: GameEventEmitter
  let emitted: IGameEvent[]
  let gs: GameState
  let player: Player

  /** Stub ReactionManager — the task opens no frames. */
  const stubRm = null as unknown as ReactionManager

  beforeEach(() => {
    emitter = new GameEventEmitter()
    emitted = []
    emitter.addListener({ onEvent: (e) => emitted.push(e) })
    gs = makeGs()
    player = makePlayer('p1', ['magic-1'])
    gs.registerPlayer(player)
    gs.registerParty(makeParty('p1'))
    gs.registerCard(makeMagicCard('magic-1'))
  })

  const ctxWith = (slot?: string[], key = CTX_DRAWN_CARD_IDS) => {
    const ctx = new AbilityContext('src-card', 'p1')
    if (slot) ctx.set(key, slot)
    return ctx
  }

  /**
   * TaskManager owns the drain, so one must be listening for a played card's
   * ability to run at all — the task only ever runs as a step inside it.
   */
  const withTaskManager = (abilities: Map<string, IAbility[]> = new Map()) =>
    new TaskManager(gs, emitter, stubRm, abilities)

  const run = (task: PlayMagicTask, ctx: AbilityContext) =>
    task.execute(gs, ctx, emitter, stubRm)

  it('plays the card named by the slot: hand to discard, via the instance pile', () => {
    withTaskManager()

    run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith(['magic-1']))

    expect(player.getHand()).not.toContain('magic-1')
    expect(gs.getDiscardPile().getAll()).toContain('magic-1')
    // Disposed of again — the pile is only where its ability was matched from.
    expect(gs.getParty('p1').getInstanceCardIds()).not.toContain('magic-1')
  })

  it('emits CardRemovedFromHand then MagicPlayed, and nothing else', () => {
    withTaskManager()

    run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith(['magic-1']))

    // Disposal is silent: it is not an ability, and MagicPlayed already
    // reported that the card was spent.
    expect(emitted.map((e) => e.getType())).toEqual([
      GameEventType.CardRemovedFromHand,
      GameEventType.MagicPlayed,
    ])
  })

  it("runs the played card's own ability, matched from the instance pile", () => {
    const spy = jest.fn()
    withTaskManager(new Map([['magic-1', [spyAbility(spy)]]]))

    run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith(['magic-1']))

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('throws when nothing has written the slot — a mis-declared ability', () => {
    expect(() =>
      run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith()),
    ).toThrow(CTX_DRAWN_CARD_IDS)
  })

  it('skips an empty slot — the step ahead ran and produced nothing', () => {
    run(new PlayMagicTask(CTX_DRAWN_CARD_IDS), ctxWith([]))

    expect(emitted).toHaveLength(0)
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
    withTaskManager()

    run(new PlayMagicTask(), ctxWith(['magic-1'], CTX_CHOSEN_CARD))

    expect(player.getHand()).not.toContain('magic-1')
  })
})
