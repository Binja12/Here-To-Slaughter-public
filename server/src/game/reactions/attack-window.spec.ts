import { CardType, GameEventType, IGameEvent, PassiveType, ReactionWindowType, RefusalReason, RollCompareMode, RollContext } from 'shared'
import { AttackWindow } from './attack-window'
import { GameState } from '../pipelines/game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { MonsterCard } from '../cards/monster-card'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeGs = () =>
  new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

/** Slain on 9+, fights back on 3-, misses on 4–8. */
const monster = (id: string) =>
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

const collect = (em: GameEventEmitter): IGameEvent[] => {
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  return events
}

function seat(gs: GameState, playerId: string): void {
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
    new Party({
      playerId,
      leaderId: `${playerId}-leader`,
      heroIds: [],
      monsterIds: [],
    }),
  )
}

/**
 * Build an AttackWindow then register its frame in gs — the constructor fires
 * immediately (emits opened, starts the timer), so the frame goes in after;
 * resolve() only needs it to exist.
 */
function makeWindow({
  gs,
  em,
  baseRoll = 5,
  rollerId = 'p1',
  monsterId = 'monster-1',
  timeoutMs = 5000,
  frameId = 'frame-1',
}: {
  gs: GameState
  em: GameEventEmitter
  baseRoll?: number
  rollerId?: string
  monsterId?: string
  timeoutMs?: number
  frameId?: string
}): AttackWindow {
  const win = new AttackWindow(
    'win-1',
    rollerId,
    baseRoll,
    monsterId,
    timeoutMs,
    gs,
    frameId,
    em,
  )
  gs.addFrame(frameId, gs.clone(), [win])
  return win
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AttackWindow', () => {
  let gs: GameState
  let em: GameEventEmitter
  let events: IGameEvent[]

  // Every window starts a timer at construction; several tests below never
  // resolve theirs, so the clock is faked for the whole file.
  beforeEach(() => {
    jest.useFakeTimers()
    gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2')
    gs.registerCard(monster('monster-1'))
    gs.getMonsterPile().add('monster-1')
    em = new GameEventEmitter()
    events = collect(em)
  })

  afterEach(() => jest.useRealTimers())

  const types = () => events.map((e) => e.getType())

  // --- Identity ---

  it('getType() returns Attack', () => {
    expect(makeWindow({ gs, em }).getType()).toBe(ReactionWindowType.Attack)
  })

  it('announces itself as an Attack window, naming the monster', () => {
    makeWindow({ gs, em, baseRoll: 5 })
    expect(events[0].getPayload()).toMatchObject({
      windowType: ReactionWindowType.Attack,
      monsterId: 'monster-1',
      baseRoll: 5,
      finalRoll: 5,
      rollerId: 'p1',
    })
  })

  // --- The bonus list, shared with ModifierWindow ---

  describe('standing bonuses', () => {
    const giveBonus = (
      ownerId: string,
      sourceCardId: string,
      value: number,
      rollContext?: RollContext,
    ) =>
      gs.addEffect({
        id: 'eff-' + sourceCardId,
        sourceCardId,
        ownerId,
        type: PassiveType.RollBonus,
        value,
        rollContext,
      })

    it('seeds the ATTACK bonuses at open, each keeping its source', () => {
      giveBonus('p1', 'leader-116', 1, RollContext.Attack)
      makeWindow({ gs, em, baseRoll: 8 })

      expect(events[0].getPayload()).toMatchObject({
        bonuses: [{ cardSource: 'leader-116', amount: 1 }],
        finalRoll: 9,
      })
    })

    it('leaves a bonus for another KIND of roll out', () => {
      giveBonus('p1', 'leader-119', 1, RollContext.HeroEffect)
      makeWindow({ gs, em, baseRoll: 8 })
      expect(events[0].getPayload()).toMatchObject({ bonuses: [], finalRoll: 8 })
    })

    it('takes an unscoped bonus — naming no kind means every kind', () => {
      giveBonus('p1', 'any-card', 2)
      makeWindow({ gs, em, baseRoll: 8 })
      expect(events[0].getPayload()).toMatchObject({
        bonuses: [{ cardSource: 'any-card', amount: 2 }],
        finalRoll: 10,
      })
    })

    it('leaves a bonus belonging to another player out', () => {
      giveBonus('p2', 'leader-116', 1, RollContext.Attack)
      makeWindow({ gs, em, baseRoll: 8 })
      expect(events[0].getPayload()).toMatchObject({ bonuses: [] })
    })
  })

  // --- Modifier cards ---

  describe('as a window a modifier can be spent into', () => {
    it('accepts a modifier for the roller and refuses one for anybody else', () => {
      const win = makeWindow({ gs, em })
      expect(win.acceptsModifierFor('p1')).toEqual({ accepted: true })
      expect(win.acceptsModifierFor('p2')).toEqual({
        accepted: false,
        reason: RefusalReason.TargetNotRolling,
      })
    })

    it('a bonus spent into it moves the outcome from a miss to a slay', () => {
      const win = makeWindow({ gs, em, baseRoll: 8 })
      win.submitReaction('p1', { value: 1, cardId: 'modifier-1' })

      expect(win.getFinalRoll()).toBe(9)
      win.resolve()

      expect(gs.getParty('p1').getMonsterIds()).toContain('monster-1')
    })

    it('a bonus spent into it can drag a slay down into a fight-back', () => {
      const win = makeWindow({ gs, em, baseRoll: 9 })
      win.submitReaction('p2', { value: -6, cardId: 'modifier-1' })

      win.resolve()

      expect(types()).toContain(GameEventType.MonsterFoughtBack)
      expect(gs.getParty('p1').getMonsterIds()).not.toContain('monster-1')
    })

    it('silence on the roller own roll falls the way that helps them', () => {
      const win = makeWindow({ gs, em })
      expect(win.valueBiasFor('p1', 'p1')).toBe('highest')
      expect(win.valueBiasFor('p2', 'p1')).toBe('lowest')
    })

    it('a card committed to it keeps it alive', () => {
      const win = makeWindow({ gs, em, baseRoll: 5 })
      jest.advanceTimersByTime(4000)
      win.cardSpent()
      jest.advanceTimersByTime(4000)
      expect(win.isOpen()).toBe(true)
      jest.advanceTimersByTime(1000)
      expect(win.isOpen()).toBe(false)
    })
  })

  // --- Settlement: the three bands ---

  describe('SLAY (roll >= 9)', () => {
    it('releases the frame', () => {
      makeWindow({ gs, em, baseRoll: 9 }).resolve()
      expect(gs.getFrames().has('frame-1')).toBe(false)
    })

    it('takes the monster out of the pile and into the roller party', () => {
      makeWindow({ gs, em, baseRoll: 9 }).resolve()
      expect(gs.getMonsterPile().getAll()).not.toContain('monster-1')
      expect(gs.getParty('p1').getMonsterIds()).toContain('monster-1')
    })

    it('turns the next monster up behind it', () => {
      gs.getMonsterDeck().addToBottom('monster-next')

      makeWindow({ gs, em, baseRoll: 9 }).resolve()

      expect(gs.getMonsterPile().getAll()).toContain('monster-next')
      expect(gs.getMonsterDeck().getSize()).toBe(0)
    })

    it('emits MonsterSlain naming the monster and the slayer', () => {
      makeWindow({ gs, em, baseRoll: 9 }).resolve()
      const slain = events.find(
        (e) => e.getType() === GameEventType.MonsterSlain,
      )
      expect(slain!.getPayload()).toMatchObject({ cardId: 'monster-1' })
      expect(slain!.getPlayerId()).toBe('p1')
    })

    it('announces the slay BEFORE the frame resolves, so the monster rules are live for it', () => {
      makeWindow({ gs, em, baseRoll: 9 }).resolve()
      expect(types().indexOf(GameEventType.MonsterSlain)).toBeLessThan(
        types().indexOf(GameEventType.FrameResolved),
      )
    })
  })

  describe('MISS (4–8)', () => {
    it('draws nothing up — the row only refills when one leaves it', () => {
      gs.getMonsterDeck().addToBottom('monster-next')
      makeWindow({ gs, em, baseRoll: 5 }).resolve()
      expect(gs.getMonsterPile().getAll()).not.toContain('monster-next')
      expect(gs.getMonsterDeck().getSize()).toBe(1)
    })

    it('restores the frame and leaves the monster in the pile', () => {
      makeWindow({ gs, em, baseRoll: 5 }).resolve()
      expect(gs.getFrames().has('frame-1')).toBe(false)
      expect(gs.getMonsterPile().getAll()).toContain('monster-1')
      expect(gs.getParty('p1').getMonsterIds()).not.toContain('monster-1')
    })

    it('announces neither outcome — the window closing is the whole report', () => {
      makeWindow({ gs, em, baseRoll: 5 }).resolve()
      expect(types()).not.toContain(GameEventType.MonsterSlain)
      expect(types()).not.toContain(GameEventType.MonsterFoughtBack)
    })
  })

  describe('FIGHT BACK (roll <= 3)', () => {
    it('restores the frame and leaves the monster in the pile', () => {
      makeWindow({ gs, em, baseRoll: 2 }).resolve()
      expect(gs.getFrames().has('frame-1')).toBe(false)
      expect(gs.getMonsterPile().getAll()).toContain('monster-1')
      expect(gs.getParty('p1').getMonsterIds()).not.toContain('monster-1')
    })

    it('emits MonsterFoughtBack naming the monster and the attacker', () => {
      makeWindow({ gs, em, baseRoll: 2 }).resolve()
      const fought = events.find(
        (e) => e.getType() === GameEventType.MonsterFoughtBack,
      )
      expect(fought!.getPayload()).toMatchObject({ cardId: 'monster-1' })
      expect(fought!.getPlayerId()).toBe('p1')
    })

    it('never emits MonsterSlain', () => {
      makeWindow({ gs, em, baseRoll: 2 }).resolve()
      expect(types()).not.toContain(GameEventType.MonsterSlain)
    })
  })

  // --- The comparison belongs to the card ---

  it('LowToWin flips which band a roll lands in', () => {
    gs.registerCard(
      new MonsterCard({
        id: 'monster-low',
        name: 'monster-low',
        type: CardType.Monster,
        image: '',
        description: '',
        set: 'test',
        partyReq: { classes: [] },
        higherReq: 4,
        lowerReq: 10,
        rollCompareMode: RollCompareMode.LowToWin,
      }),
    )
    gs.getMonsterPile().add('monster-low')

    makeWindow({ gs, em, baseRoll: 3, monsterId: 'monster-low' }).resolve()

    expect(gs.getParty('p1').getMonsterIds()).toContain('monster-low')
  })

  // --- Lifecycle, shared with every other window ---

  it('resolves on its own when the timeout elapses', () => {
    const win = makeWindow({ gs, em, baseRoll: 9 })
    expect(win.isOpen()).toBe(true)
    jest.advanceTimersByTime(5000)
    expect(win.isOpen()).toBe(false)
    expect(gs.getParty('p1').getMonsterIds()).toContain('monster-1')
  })

  it('a second resolve is a no-op — the monster is not slain twice', () => {
    const win = makeWindow({ gs, em, baseRoll: 9 })
    win.resolve()
    win.resolve()
    expect(gs.getParty('p1').getMonsterIds()).toEqual(['monster-1'])
    expect(
      types().filter((t) => t === GameEventType.MonsterSlain),
    ).toHaveLength(1)
  })
})
