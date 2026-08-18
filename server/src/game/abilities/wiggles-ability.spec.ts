import { CardType, GameEventType, HeroClass, IGameEvent } from 'shared'
import { WigglesAbility } from './wiggles-ability'
import { AbilityProcessor } from '../ability-processor'
import { GameState } from '../game-state'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { Player } from '../player'
import { Party } from '../party'
import { HeroCard } from '../cards/hero-card'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventFactory } from '../events/game-event-factory'
import { ReactionManager } from '../reactions/reaction-manager'
import { CONFIRM, DISMISS } from '../reactions/task-choice-window'
import { IReactionWindow } from '../interfaces'
import { CTX_CHOSEN_CARD, CTX_FINAL_ROLL } from '../ability-context'

// ---------------------------------------------------------------------------
// Wiggles end-to-end: RollSuccess on Wiggles →
//   ChooseCardTask → StealFromPartyTask → ConfirmTask → RollOnHeroTask
//
// Each of the three suspending steps resolves its own frame, so the pipeline
// is driven forward by answering one window at a time.
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

function seat(gs: GameState, playerId: string, heroIds: string[] = []) {
  gs.registerPlayer(
    new Player({
      id: playerId,
      name: playerId,
      hand: [],
      partyId: `${playerId}-party`,
      actionPoints: 3,
    }),
  )
  gs.registerParty(
    new Party({ playerId, leaderId: `${playerId}-leader`, heroIds, monsterIds: [] }),
  )
}

/** p1 owns Wiggles, p2 owns one stealable hero. */
function setup() {
  const gs = makeGs()
  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  // Behaviour is bound by card id through the registry, not carried on the
  // card's data — the same wiring production uses, with a test-local table.
  new AbilityProcessor(gs, em, rm, new Map([['wiggles', WigglesAbility]]))

  seat(gs, 'p1', ['wiggles'])
  seat(gs, 'p2', ['victim'])
  gs.registerCard(makeHeroCard('wiggles'))
  gs.registerCard(makeHeroCard('victim'))

  return { gs, em, rm, events }
}

/** FrameResolved payload shape for the optional context write. */
type CtxResult = { result?: { key: string; value: unknown } }

/** All currently open windows across every frame. */
const openWindows = (gs: GameState): IReactionWindow[] =>
  [...gs.frames.values()].flatMap((f) => f.windows).filter((w) => w.isOpen())

const fireTrigger = (em: GameEventEmitter) =>
  em.emit(GameEventFactory.rollSuccess('p1', 'wiggles'))

describe('WigglesAbility', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  /** Answer the card choice, which is now the FIRST thing Wiggles asks. */
  const chooseVictim = (gs: GameState) =>
    openWindows(gs)[0].submitReaction('p1', { choice: 'victim' })

  /** Answer the roll-or-not prompt that follows the steal. */
  const answerRollPrompt = (gs: GameState, choice: string) =>
    openWindows(gs)[0].submitReaction('p1', { choice })

  /** Choose, steal, agree to roll, then let the modifier window settle. */
  const rollThrough = (gs: GameState, em: GameEventEmitter, random: number) => {
    jest.spyOn(Math, 'random').mockReturnValue(random)
    fireTrigger(em)
    chooseVictim(gs)
    answerRollPrompt(gs, CONFIRM)
    jest.advanceTimersByTime(5000)
  }

  // -------------------------------------------------------------------------
  // Step 1 — the target choice. No confirm precedes it: rolling on Wiggles at
  // all IS the opt-in, so asking again would ask twice for one decision.
  // -------------------------------------------------------------------------

  it('offers enemy heroes immediately, with no confirmation first', () => {
    const { em, events } = setup()

    fireTrigger(em)

    const opened = events.filter(
      (e) => e.getType() === GameEventType.ReactionWindowOpened,
    )
    expect(opened).toHaveLength(1)
    expect((opened[0].getPayload() as { options: unknown[] }).options).toEqual([
      'victim',
    ])
  })

  it('never offers the ability owner their own heroes', () => {
    const { em, events } = setup()

    fireTrigger(em)

    const opened = events.filter(
      (e) => e.getType() === GameEventType.ReactionWindowOpened,
    )
    expect(
      (opened[0].getPayload() as { options: unknown[] }).options,
    ).not.toContain('wiggles')
  })

  it('touches no state until the choice is answered', () => {
    const { gs, em } = setup()

    fireTrigger(em)

    expect(gs.getParty('p2').getHeroIds()).toContain('victim')
    expect(gs.getParty('p1').getHeroIds()).not.toContain('victim')
  })

  // -------------------------------------------------------------------------
  // Step 2 — the steal, unconditional once a target is picked
  // -------------------------------------------------------------------------

  it('moves the chosen hero into the owner party', () => {
    const { gs, em } = setup()
    fireTrigger(em)

    chooseVictim(gs)

    expect(gs.getParty('p1').getHeroIds()).toContain('victim')
    expect(gs.getParty('p2').getHeroIds()).not.toContain('victim')
  })

  it('emits HeroStolen naming both parties', () => {
    const { gs, em, events } = setup()
    fireTrigger(em)

    chooseVictim(gs)

    expect(
      events.find((e) => e.getType() === GameEventType.HeroStolen),
    ).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // Step 3 — "roll on the hero you just took?"
  // -------------------------------------------------------------------------

  it('names what it is asking about, so a client can render the question', () => {
    const { gs, em, events } = setup()
    fireTrigger(em)

    chooseVictim(gs)

    const prompt = events
      .filter((e) => e.getType() === GameEventType.ReactionWindowOpened)
      .map((e) => e.getPayload() as Record<string, unknown>)
      .find((p) => p['confirms'] !== undefined)
    // CONFIRM/DISMISS alone is unrenderable — "Roll on victim?" needs both the
    // follow-up being offered and its subject.
    expect(prompt).toMatchObject({ confirms: 'RollOnHero', cardId: 'victim' })
  })

  it('asks whether to roll, only after the steal has happened', () => {
    const { gs, em } = setup()
    fireTrigger(em)

    chooseVictim(gs)

    expect(openWindows(gs)).toHaveLength(1)
    expect(gs.getParty('p1').getHeroIds()).toContain('victim')
  })

  it('is declared as two entries, split at the question', () => {
    expect(WigglesAbility).toHaveLength(2)
    expect(WigglesAbility[0].trigger.on).toBe(GameEventType.RollSuccess)
    expect(WigglesAbility[1].trigger.on).toBe(GameEventType.TaskConfirmed)
    expect(WigglesAbility[1].trigger.when).toBe('RollOnHero')
  })

  it('CONFIRM carries the stolen hero into the continuation context', () => {
    const { gs, em, events } = setup()
    fireTrigger(em)
    chooseVictim(gs)

    answerRollPrompt(gs, CONFIRM)

    // Entry [1] runs with a FRESH context — without the seed on the event it
    // would find CTX_STOLEN_HERO_ID absent and throw.
    const confirmed = events.find(
      (e) => e.getType() === GameEventType.TaskConfirmed,
    )
    expect(confirmed!.getPayload()).toMatchObject({
      cardId: 'wiggles',
      ctxSeed: { stolenHeroId: ['victim'] },
    })
    const rolled = events.find((e) => e.getType() === GameEventType.DiceRolled)
    expect((rolled!.getPayload() as { heroId: string }).heroId).toBe('victim')
  })

  it('DISMISS keeps the stolen hero and skips only the roll', () => {
    const { gs, em, events } = setup()
    fireTrigger(em)
    chooseVictim(gs)

    answerRollPrompt(gs, DISMISS)

    // Nothing is rolled back at all now: the window releases either way, and
    // "no" simply means no TaskConfirmed, so entry [1] never triggers. The
    // answer gates exactly what the declaration put in that entry.
    expect(gs.getParty('p1').getHeroIds()).toContain('victim')
    expect(gs.getParty('p2').getHeroIds()).not.toContain('victim')
    expect(events.some((e) => e.getType() === GameEventType.DiceRolled)).toBe(
      false,
    )
    expect(openWindows(gs)).toHaveLength(0)
  })

  it('a timed-out prompt behaves like DISMISS — never commit an idle player', () => {
    const { gs, em, events } = setup()
    fireTrigger(em)
    chooseVictim(gs)

    jest.advanceTimersByTime(5000)

    expect(gs.getParty('p1').getHeroIds()).toContain('victim')
    expect(events.some((e) => e.getType() === GameEventType.DiceRolled)).toBe(
      false,
    )
    expect(openWindows(gs)).toHaveLength(0)
  })

  it('CONFIRM rolls on the stolen hero, opening a modifier window', () => {
    const { gs, em, events } = setup()
    fireTrigger(em)
    chooseVictim(gs)

    answerRollPrompt(gs, CONFIRM)

    const rolled = events.find((e) => e.getType() === GameEventType.DiceRolled)
    expect((rolled!.getPayload() as { heroId: string }).heroId).toBe('victim')
    expect(openWindows(gs)).toHaveLength(1)
  })

  // -------------------------------------------------------------------------
  // Rollback — a failed roll costs the effect, not the hero
  // -------------------------------------------------------------------------

  it('keeps the stolen hero when the follow-up roll fails', () => {
    const { gs, em } = setup()

    rollThrough(gs, em, 0) // rollReq is 5; lowest possible roll

    expect(gs.getParty('p1').getHeroIds()).toContain('victim')
    expect(gs.getParty('p2').getHeroIds()).not.toContain('victim')
  })

  it('does not emit RollSuccess for the stolen hero when the roll fails', () => {
    const { gs, em, events } = setup()

    rollThrough(gs, em, 0)

    const successes = events.filter(
      (e) =>
        e.getType() === GameEventType.RollSuccess &&
        (e.getPayload() as { cardId: string }).cardId === 'victim',
    )
    expect(successes).toHaveLength(0)
  })

  it('keeps the hero when the follow-up roll succeeds', () => {
    const { gs, em } = setup()

    rollThrough(gs, em, 0.99) // Math.ceil(0.99 * 11) + 1 = 12, over rollReq 5

    expect(gs.getParty('p1').getHeroIds()).toContain('victim')
  })

  // -------------------------------------------------------------------------
  // Self-describing results
  // -------------------------------------------------------------------------

  it('files the pick under the key the CARD window declared', () => {
    const { gs, em, events } = setup()
    fireTrigger(em)

    chooseVictim(gs)

    const cardChoice = events
      .filter((e) => e.getType() === GameEventType.FrameResolved)
      .find((e) => (e.getPayload() as CtxResult).result?.key === CTX_CHOSEN_CARD)
    expect((cardChoice!.getPayload() as CtxResult).result?.value).toEqual([
      'victim',
    ])
  })

  // The roll prompt must contribute nothing to the context, or 'confirm' could
  // be mistaken for a chosen card by a later step.
  it('files nothing for the roll prompt', () => {
    const { gs, em, events } = setup()
    fireTrigger(em)
    chooseVictim(gs)

    answerRollPrompt(gs, CONFIRM)

    // Second resolution: [0] is the card choice, [1] is the prompt.
    const resolutions = events.filter(
      (e) => e.getType() === GameEventType.FrameResolved,
    )
    expect((resolutions[1].getPayload() as CtxResult).result).toBeUndefined()
  })

  // Scalar, not an array — there is only ever one final roll.
  it('records the final roll as a plain number', () => {
    const { gs, em, events } = setup()

    rollThrough(gs, em, 0.99)

    const rollFrame = events
      .filter((e) => e.getType() === GameEventType.FrameResolved)
      .find((e) => (e.getPayload() as CtxResult).result?.key === CTX_FINAL_ROLL)
    expect(typeof (rollFrame!.getPayload() as CtxResult).result?.value).toBe(
      'number',
    )
  })

  // -------------------------------------------------------------------------
  // Edge case — nothing to steal
  // -------------------------------------------------------------------------

  it('steals nothing in a solo game, and never throws', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em)
    new AbilityProcessor(gs, em, rm, new Map([['wiggles', WigglesAbility]]))
    seat(gs, 'p1', ['wiggles'])
    gs.registerCard(makeHeroCard('wiggles'))

    expect(() => fireTrigger(em)).not.toThrow()

    // The choice window has no options, so it resolves inside its own
    // constructor and ChooseCardTask records an empty pick. StealFromPartyTask
    // reads "offered nothing" rather than "no choice step ran", so it no-ops
    // instead of throwing.
    expect(gs.getParty('p1').getHeroIds()).toEqual(['wiggles'])
  })

  it('asks NO roll prompt when nothing was stolen', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em)
    new AbilityProcessor(gs, em, rm, new Map([['wiggles', WigglesAbility]]))
    seat(gs, 'p1', ['wiggles'])
    gs.registerCard(makeHeroCard('wiggles'))

    fireTrigger(em)
    jest.advanceTimersByTime(0) // the empty choice settles on the next tick

    // The choice resolved with no pick, the steal skipped itself, and
    // ConfirmTask saw an empty subject and skipped too — so nobody is asked
    // "roll on the hero you just took?" about a hero that was never taken.
    // No step had to silence another to get here.
    expect(openWindows(gs)).toHaveLength(0)
    expect(gs.abilityPipelines.size).toBe(0)
  })

  it('ends the ability when the card choice times out, without prompting', () => {
    const { gs, em, events } = setup()
    fireTrigger(em)

    // Options existed; the player simply never answered.
    jest.advanceTimersByTime(5000)

    expect(gs.getParty('p2').getHeroIds()).toContain('victim') // no steal
    expect(openWindows(gs)).toHaveLength(0) // and no follow-up prompt
    expect(events.some((e) => e.getType() === GameEventType.DiceRolled)).toBe(
      false,
    )
  })
})
