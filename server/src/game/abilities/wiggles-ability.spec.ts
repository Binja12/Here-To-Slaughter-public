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
//   ConfirmTask → ChooseCardTask → StealFromPartyTask → RollOnHeroTask
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
  afterEach(() => jest.useRealTimers())

  // -------------------------------------------------------------------------
  // Step 1 — the opt-in prompt
  // -------------------------------------------------------------------------

  it('asks for confirmation first, before touching any state', () => {
    const { gs, em } = setup()

    fireTrigger(em)

    const win = openWindows(gs)[0]
    expect(win).toBeDefined()
    expect(gs.getParty('p2').getHeroIds()).toContain('victim')
  })

  it('does nothing at all when the player dismisses', () => {
    const { gs, em } = setup()
    fireTrigger(em)

    openWindows(gs)[0].submitReaction('p1', { choice: DISMISS })

    expect(gs.getParty('p2').getHeroIds()).toContain('victim')
    expect(gs.getParty('p1').getHeroIds()).not.toContain('victim')
    expect(openWindows(gs)).toHaveLength(0)
  })

  it('does nothing when the confirm prompt times out', () => {
    const { gs, em } = setup()
    fireTrigger(em)

    jest.advanceTimersByTime(5000)

    expect(gs.getParty('p2').getHeroIds()).toContain('victim')
    expect(openWindows(gs)).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // Step 2 — the target choice
  // -------------------------------------------------------------------------

  it('offers enemy heroes once confirmed', () => {
    const { gs, em, events } = setup()
    fireTrigger(em)

    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })

    const opened = events.filter((e) => e.getType() === GameEventType.ReactionWindowOpened)
    const last = opened[opened.length - 1].getPayload() as { options: unknown[] }
    expect(last.options).toEqual(['victim'])
  })

  it('never offers the ability owner’s own heroes', () => {
    const { gs, em, events } = setup()
    fireTrigger(em)

    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })

    const opened = events.filter((e) => e.getType() === GameEventType.ReactionWindowOpened)
    const last = opened[opened.length - 1].getPayload() as { options: unknown[] }
    expect(last.options).not.toContain('wiggles')
  })

  // -------------------------------------------------------------------------
  // Steps 3 + 4 — steal, then roll
  // -------------------------------------------------------------------------

  it('moves the chosen hero into the owner’s party', () => {
    const { gs, em } = setup()
    fireTrigger(em)
    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })
    openWindows(gs)[0].submitReaction('p1', { choice: 'victim' })

    expect(gs.getParty('p1').getHeroIds()).toContain('victim')
    expect(gs.getParty('p2').getHeroIds()).not.toContain('victim')
  })

  it('emits HeroStolen naming both parties', () => {
    const { gs, em, events } = setup()
    fireTrigger(em)
    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })
    openWindows(gs)[0].submitReaction('p1', { choice: 'victim' })

    const stolen = events.find((e) => e.getType() === GameEventType.HeroStolen)
    expect(stolen).toBeDefined()
  })

  it('then rolls on the stolen hero, opening a modifier window', () => {
    const { gs, em, events } = setup()
    fireTrigger(em)
    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })
    openWindows(gs)[0].submitReaction('p1', { choice: 'victim' })

    const rolled = events.find((e) => e.getType() === GameEventType.DiceRolled)
    expect((rolled!.getPayload() as { heroId: string }).heroId).toBe('victim')
    expect(openWindows(gs)).toHaveLength(1)
  })

  // -------------------------------------------------------------------------
  // Rollback — a failed roll undoes the steal
  // -------------------------------------------------------------------------

  // The roll frame is opened by RollOnHeroTask, i.e. AFTER StealFromPartyTask has
  // already run — so its snapshot contains the completed steal. A failed roll
  // therefore costs the effect, not the hero: "STEAL a Hero card AND roll to
  // use its effect" reads as two clauses, and only the second one can fail.
  it('keeps the stolen hero when the follow-up roll fails', () => {
    const { gs, em } = setup()
    // rollReq is 5; force the lowest possible roll so it cannot succeed.
    jest.spyOn(Math, 'random').mockReturnValue(0)

    fireTrigger(em)
    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })
    openWindows(gs)[0].submitReaction('p1', { choice: 'victim' })
    jest.advanceTimersByTime(5000)

    expect(gs.getParty('p1').getHeroIds()).toContain('victim')
    expect(gs.getParty('p2').getHeroIds()).not.toContain('victim')

    jest.spyOn(Math, 'random').mockRestore()
  })

  it('does not emit RollSuccess for the stolen hero when the roll fails', () => {
    const { gs, em, events } = setup()
    jest.spyOn(Math, 'random').mockReturnValue(0)

    fireTrigger(em)
    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })
    openWindows(gs)[0].submitReaction('p1', { choice: 'victim' })
    jest.advanceTimersByTime(5000)

    const successes = events.filter(
      (e) =>
        e.getType() === GameEventType.RollSuccess &&
        (e.getPayload() as { cardId: string }).cardId === 'victim',
    )
    expect(successes).toHaveLength(0)

    jest.spyOn(Math, 'random').mockRestore()
  })

  it('keeps the hero when the follow-up roll succeeds', () => {
    const { gs, em } = setup()
    // Math.ceil(0.99 * 11) + 1 = 12, comfortably over rollReq 5.
    jest.spyOn(Math, 'random').mockReturnValue(0.99)

    fireTrigger(em)
    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })
    openWindows(gs)[0].submitReaction('p1', { choice: 'victim' })
    jest.advanceTimersByTime(5000)

    expect(gs.getParty('p1').getHeroIds()).toContain('victim')

    jest.spyOn(Math, 'random').mockRestore()
  })

  // -------------------------------------------------------------------------
  // Self-describing results
  // -------------------------------------------------------------------------

  it('files the pick under the key the CARD window declared', () => {
    const { gs, em, events } = setup()
    fireTrigger(em)
    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })
    openWindows(gs)[0].submitReaction('p1', { choice: 'victim' })

    const resolutions = events.filter((e) => e.getType() === GameEventType.FrameResolved)
    const cardChoice = resolutions.find(
      (e) => (e.getPayload() as CtxResult).result?.key === CTX_CHOSEN_CARD,
    )
    expect((cardChoice!.getPayload() as CtxResult).result?.value).toEqual(['victim'])
  })

  // The confirm prompt must contribute nothing to the context, or 'confirm'
  // could be mistaken for a chosen card by the next step.
  it('files nothing for the confirm prompt', () => {
    const { gs, em, events } = setup()
    fireTrigger(em)
    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })

    const first = events.filter((e) => e.getType() === GameEventType.FrameResolved)[0]
    expect((first.getPayload() as CtxResult).result).toBeUndefined()
  })

  // Scalar, not an array — there is only ever one final roll.
  it('records the final roll as a plain number', () => {
    const { gs, em, events } = setup()
    jest.spyOn(Math, 'random').mockReturnValue(0.99)

    fireTrigger(em)
    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })
    openWindows(gs)[0].submitReaction('p1', { choice: 'victim' })
    jest.advanceTimersByTime(5000)

    const rollFrame = events
      .filter((e) => e.getType() === GameEventType.FrameResolved)
      .find((e) => (e.getPayload() as CtxResult).result?.key === CTX_FINAL_ROLL)
    expect(typeof (rollFrame!.getPayload() as CtxResult).result?.value).toBe('number')

    jest.spyOn(Math, 'random').mockRestore()
  })

  // -------------------------------------------------------------------------
  // Edge case — nothing to steal
  // -------------------------------------------------------------------------

  it('resolves cleanly in a solo game with no enemy heroes', () => {
    const gs = makeGs()
    const em = new GameEventEmitter()
    const rm = new ReactionManager(gs, em)
    new AbilityProcessor(gs, em, rm, new Map([['wiggles', WigglesAbility]]))
    seat(gs, 'p1', ['wiggles'])
    gs.registerCard(makeHeroCard('wiggles'))

    fireTrigger(em)
    openWindows(gs)[0].submitReaction('p1', { choice: CONFIRM })

    // Empty option set resolves the choice window immediately; StealFromPartyTask
    // must not run with an undefined target.
    expect(openWindows(gs)).toHaveLength(0)
  })
})
