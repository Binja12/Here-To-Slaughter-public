import {
  CardType,
  GameEventType,
  IGameEvent,
  ReactionWindowType,
  TriggerScope,
} from 'shared'
import { instanceRules } from './instance-rules'
import { GameState } from '../../pipelines/game-state'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { MagicCard } from '../../cards/magic-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { PlayMagicTask } from '../../tasks/magic-tasks'
import { ConfirmTask } from '../../tasks/choose-tasks'
import { AbilityContext, CTX_CHOSEN_CARD } from '../../abilities/ability-context'
import { CONFIRM } from '../../reactions/task-choice-window'
import { IAbilityRule, IReactionWindow, ITask } from '../../interfaces'

// ---------------------------------------------------------------------------
// A played card leaves the instance pile when its run is over — and not one
// event before, because the pile is what keeps a card out of the DISCARD while
// it resolves. A magic card that picks from the discard must not be able to
// pick itself, and the pile is what makes that true of the board rather than
// of a filter.
//
// None of the cards here declare a disposal step. That is the point.
// ---------------------------------------------------------------------------

const ASKS = 'Asks'

const makeGs = () =>
  new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

const makeMagic = (id: string) =>
  new MagicCard({
    id,
    name: id,
    type: CardType.Magic,
    image: '',
    description: '',
    set: 'test',
  })

/** A magic card's entry: triggered by the settled play, disposal unmentioned. */
const played = (steps: ITask[]): IAbilityRule => ({
  trigger: { on: GameEventType.FrameResolved, scope: TriggerScope.SelfCard },
  steps,
})

function setup(entries: IAbilityRule[]) {
  const gs = makeGs()
  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  new TaskManager(gs, em, rm, new Map([['magic-1', entries]]))

  gs.registerPlayer(
    new Player({
      id: 'p1',
      name: 'p1',
      hand: ['magic-1'],
      partyId: 'p1-party',
      actionPoints: 3,
    }),
  )
  gs.registerParty(
    new Party({ playerId: 'p1', leaderId: 'p1-leader', heroIds: [], monsterIds: [] }),
  )
  gs.registerCard(makeMagic('magic-1'))

  const ctx = new AbilityContext('driver', 'p1')
  ctx.set(CTX_CHOSEN_CARD, ['magic-1'])
  new PlayMagicTask().execute(gs, ctx, em, rm)

  return { gs, em, events }
}

const openWindows = (gs: GameState): IReactionWindow[] =>
  [...gs.frames.values()].flatMap((f) => f.windows).filter((w) => w.isOpen())

const inPile = (gs: GameState) =>
  gs.getParty('p1').getInstanceCardIds().includes('magic-1')
const inDiscard = (gs: GameState) =>
  gs.getDiscardPile().getAll().includes('magic-1')

describe('instance rules — a played card puts itself away', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('is one rule, hung off the end of a run rather than a card wording', () => {
    expect(instanceRules).toHaveLength(1)
    expect(instanceRules[0].trigger.on).toBe(GameEventType.AbilityDone)
    expect(instanceRules[0].trigger.scope).toBe(TriggerScope.SelfCard)
  })

  it('holds the card in the pile while the challenge is still open', () => {
    const { gs } = setup([played([])])

    // Not resolved yet: the play has not even been allowed to stand.
    expect(inPile(gs)).toBe(true)
    expect(inDiscard(gs)).toBe(false)
  })

  it('discards a straight-through card once its entry has run', () => {
    const { gs } = setup([played([{ execute: () => {} }])])

    jest.advanceTimersByTime(5000) // challenge lapses -> the entry runs

    expect(inPile(gs)).toBe(false)
    expect(inDiscard(gs)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // The case that used to need the author to know about emit ordering: a card
  // that splits at a question has to be put away on BOTH answers, and not
  // while the second half is still pending.
  // -------------------------------------------------------------------------

  it('holds the card while a continuation is still parked on its question', () => {
    const { gs } = setup([
      played([new ConfirmTask({ confirms: ASKS })]),
      {
        trigger: {
          on: GameEventType.TaskConfirmed,
          scope: TriggerScope.SelfCard,
          when: ASKS,
        },
        steps: [{ execute: () => {} }],
      },
    ])

    jest.advanceTimersByTime(5000) // challenge lapses -> the prompt opens

    // Entry [0] has no steps left, but the card is plainly not finished.
    expect(openWindows(gs)[0].getType()).toBe(ReactionWindowType.TaskChoice)
    expect(inPile(gs)).toBe(true)
  })

  it('discards it on CONFIRM, after the continuation has run', () => {
    const ran: string[] = []
    const { gs } = setup([
      played([new ConfirmTask({ confirms: ASKS })]),
      {
        trigger: {
          on: GameEventType.TaskConfirmed,
          scope: TriggerScope.SelfCard,
          when: ASKS,
        },
        steps: [
          {
            execute: (g) => {
              // Still in play at this point — its own steps can rely on that.
              ran.push(
                g.getParty('p1').getInstanceCardIds().includes('magic-1')
                  ? 'in play'
                  : 'gone',
              )
            },
          },
        ],
      },
    ])

    jest.advanceTimersByTime(5000)
    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })

    expect(ran).toEqual(['in play'])
    expect(inPile(gs)).toBe(false)
    expect(inDiscard(gs)).toBe(true)
  })

  it('discards it on DISMISS too, where the continuation never runs', () => {
    const { gs } = setup([
      played([new ConfirmTask({ confirms: ASKS })]),
      {
        trigger: {
          on: GameEventType.TaskConfirmed,
          scope: TriggerScope.SelfCard,
          when: ASKS,
        },
        steps: [{ execute: () => {} }],
      },
    ])

    jest.advanceTimersByTime(5000) // challenge lapses -> prompt opens
    jest.advanceTimersByTime(5000) // prompt lapses, which is a DISMISS

    expect(inPile(gs)).toBe(false)
    expect(inDiscard(gs)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Termination. The disposal is itself a pipeline sourced to the card, so its
  // own ending must not announce the card finished all over again.
  // -------------------------------------------------------------------------

  it('announces the card done ONCE — its own disposal is not news', () => {
    const { gs, events } = setup([played([{ execute: () => {} }])])

    jest.advanceTimersByTime(5000)

    const done = events.filter(
      (e) =>
        e.getType() === GameEventType.AbilityDone &&
        (e.getPayload() as { cardId: string }).cardId === 'magic-1',
    )

    // Disposal is a run sourced to this card too, so without the system filter
    // its own ending would report the card done a second time — a duplicate in
    // the log for one play.
    expect(done).toHaveLength(1)
    expect(gs.abilityPipelines).toHaveLength(0)
  })

  it('discards the card exactly once', () => {
    const { gs } = setup([played([{ execute: () => {} }])])

    jest.advanceTimersByTime(5000)

    expect(gs.getDiscardPile().getAll().filter((c) => c === 'magic-1')).toEqual([
      'magic-1',
    ])
  })
})
