import {
  CardType,
  GameEventType,
  IGameEvent,
  ReactionWindowType,
  RollCompareMode,
} from 'shared'
import { AttackMonsterTask } from './attack-monster-task'
import { GameState } from '../pipelines/game-state'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { MonsterCard } from '../cards/monster-card'
import { MagicCard } from '../cards/magic-card'
import { AbilityContext, CTX_CHOSEN_CARD } from '../abilities/ability-context'
import { GameEventEmitter } from '../events/game-event-emitter'
import { ReactionManager } from '../pipelines/reaction-manager'

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

/** Slain on 9+, fights back on 3-, misses in between. */
const makeMonsterCard = (id: string) =>
  new MonsterCard({
    id,
    name: id,
    type: CardType.Monster,
    image: '',
    description: '',
    set: 'test',
    partyReq: { classes: [] },
    higherReq: 9,
    lowerReq: 3,
    rollCompareMode: RollCompareMode.HighToWin,
  })

// ---------------------------------------------------------------------------
// AttackMonsterTask — the same mechanic as AttackMonsterAction, with no price
// and a target discovered at runtime. The wrapper is what is under test here;
// the outcome bands belong to AttackWindow.
// ---------------------------------------------------------------------------

describe('AttackMonsterTask', () => {
  // The attack window runs on a timer; leave none behind.
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  const armed = () => {
    const gs = makeGs()
    gs.registerPlayer(
      new Player({ id: 'p1', name: 'p1', hand: [], partyId: 'p1-party', actionPoints: 3 }),
    )
    gs.registerParty(
      new Party({
        playerId: 'p1',
        leaderId: 'p1-leader',
        heroIds: [],
        monsterIds: [],
      }),
    )
    gs.registerCard(makeMonsterCard('monster-1'))
    gs.getMonsterPile().add('monster-1')
    gs.registerCard(
      new MagicCard({
        id: 'magic-1',
        name: 'magic-1',
        type: CardType.Magic,
        image: '',
        description: '',
        set: 'test',
      }),
    )

    const emitter = new GameEventEmitter()
    const emitted: IGameEvent[] = []
    emitter.addListener({ onEvent: (e) => emitted.push(e) })
    return { gs, emitter, emitted, rm: new ReactionManager(gs, emitter) }
  }

  const ctxWith = (cards: string[] | undefined, sourceCardId = 'src-card') => {
    const ctx = new AbilityContext(sourceCardId, 'p1')
    if (cards !== undefined) ctx.set(CTX_CHOSEN_CARD, cards)
    return ctx
  }

  // --- the slot contract ---

  it('throws when the slot it was named holds nothing — a mis-declared ability', () => {
    const { gs, emitter, rm } = armed()
    expect(() =>
      new AttackMonsterTask().execute(gs, ctxWith(undefined), emitter, rm),
    ).toThrow(/nothing has written/)
  })

  it('skips an empty slot — the step ahead ran and produced nothing', () => {
    const { gs, emitter, emitted, rm } = armed()
    expect(
      new AttackMonsterTask().execute(gs, ctxWith([]), emitter, rm),
    ).toBeUndefined()
    expect(emitted).toHaveLength(0)
  })

  it('reads whatever slot it was named, not only the choice slot', () => {
    const { gs, emitter, emitted, rm } = armed()
    const ctx = ctxWith(undefined)
    ctx.set('somewhereElse', ['monster-1'])

    new AttackMonsterTask('somewhereElse').execute(gs, ctx, emitter, rm)

    const rolled = emitted.find((e) => e.getType() === GameEventType.DiceRolled)
    expect((rolled!.getPayload() as { cardId: string }).cardId).toBe('monster-1')
  })

  // --- targets it refuses ---

  it('skips a card that is not a monster', () => {
    const { gs, emitter, emitted, rm } = armed()
    expect(
      new AttackMonsterTask().execute(gs, ctxWith(['magic-1']), emitter, rm),
    ).toBeUndefined()
    expect(emitted).toHaveLength(0)
  })

  it('skips a monster that has left the pile since the slot was written', () => {
    const { gs, emitter, emitted, rm } = armed()
    gs.getMonsterPile().pick('monster-1')

    expect(
      new AttackMonsterTask().execute(gs, ctxWith(['monster-1']), emitter, rm),
    ).toBeUndefined()
    expect(emitted).toHaveLength(0)
  })

  // --- the roll itself ---

  it('announces the raw die, then opens an attack window naming the monster', () => {
    const { gs, emitter, emitted, rm } = armed()
    jest.spyOn(Math, 'random').mockReturnValue(0.99) // baseRoll 12

    new AttackMonsterTask().execute(gs, ctxWith(['monster-1']), emitter, rm)

    expect(emitted.map((e) => e.getType())).toEqual([
      GameEventType.DiceRolled,
      GameEventType.ReactionWindowOpened,
    ])
    expect(emitted[1].getPayload()).toMatchObject({
      windowType: ReactionWindowType.Attack,
      monsterId: 'monster-1',
      baseRoll: 12,
      rollerId: 'p1',
    })
  })

  it('returns the frameId, so the rest of the declaring entry waits on the roll', () => {
    const { gs, emitter, rm } = armed()
    jest.spyOn(Math, 'random').mockReturnValue(0.99)

    const frameId = new AttackMonsterTask().execute(
      gs,
      ctxWith(['monster-1']),
      emitter,
      rm,
    )

    expect(typeof frameId).toBe('string')
    expect(gs.frames.has(frameId as string)).toBe(true)
  })

  it('rolls for the ability owner, and slays into that owner party', () => {
    const { gs, emitter, rm } = armed()
    jest.spyOn(Math, 'random').mockReturnValue(0.99) // 12 >= 9

    new AttackMonsterTask().execute(gs, ctxWith(['monster-1']), emitter, rm)
    jest.advanceTimersByTime(5000)

    expect(gs.getParty('p1').getMonsterIds()).toContain('monster-1')
    expect(gs.getMonsterPile().getAll()).not.toContain('monster-1')
  })

  it('costs no action points — a task has no price', () => {
    const { gs, emitter, rm } = armed()
    jest.spyOn(Math, 'random').mockReturnValue(0.99)

    new AttackMonsterTask().execute(gs, ctxWith(['monster-1']), emitter, rm)
    jest.advanceTimersByTime(5000)

    expect(gs.getPlayer('p1')!.getActionPoints()).toBe(3)
  })

  it('does not spend a once-per-turn slot — attacking is priced in points', () => {
    const { gs, emitter, rm } = armed()
    jest.spyOn(Math, 'random').mockReturnValue(0.99)

    new AttackMonsterTask().execute(gs, ctxWith(['monster-1']), emitter, rm)

    expect(gs.getAbilitiesUsedThisTurn()).not.toContain('monster-1')
  })
})
