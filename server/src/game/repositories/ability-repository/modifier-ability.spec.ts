import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  ReactionWindowType,
  RefusalReason,
} from 'shared'
import { ModifierAbility } from './modifier-ability'
import { abilityRegistry } from './index'
import { GameState } from '../../pipelines/game-state'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { HeroCard } from '../../cards/hero-card'
import { ModifierCard } from '../../cards/modifier-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { RollOnHeroAction } from '../../actions/roll-on-hero-action'
import { PlayModifierReaction } from '../../reactions/play-modifier-reaction'

// ---------------------------------------------------------------------------
// Modifier (modifier-077 …) — what the card is WORTH, as a registry entry.
//
// The reaction verifies the value and spends the card; this lands it. The two
// halves are tested separately: play-modifier-reaction.spec.ts owns the play.
//
//   hero roll = ceil(random * 11) + 1  -> 0 => 1
//   hero-1 needs 6, so a bare roll of 1 fails and +5 rescues it.
// ---------------------------------------------------------------------------

const MOD = 'modifier-077'
const HERO = 'hero-1'
const ROLL_REQ = 6

const LOW = 0 // baseRoll 1

function setup(values: number[]) {
  const gs = new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

  for (const [playerId, hand, heroIds] of [
    ['p1', [], [HERO]],
    ['p2', [MOD], []],
  ] as const) {
    gs.registerPlayer(
      new Player({
        id: playerId,
        name: playerId,
        hand: [...hand],
        partyId: playerId + '-party',
        actionPoints: 3,
      }),
    )
    gs.registerParty(
      new Party({
        playerId,
        leaderId: playerId + '-leader',
        heroIds: [...heroIds],
        monsterIds: [],
      }),
    )
  }
  gs.setCurrentPlayerId('p1')

  gs.registerCard(
    new HeroCard({
      id: HERO,
      name: HERO,
      type: CardType.Hero,
      image: '',
      description: '',
      set: 'base',
      heroClass: HeroClass.Wizard,
      rollReq: ROLL_REQ,
    }),
  )
  gs.registerCard(
    new ModifierCard({
      id: MOD,
      name: 'Modifier',
      type: CardType.Modifier,
      image: '',
      description: '',
      set: 'base',
      // The test's own numbers. Behaviour is keyed by id; the values are data.
      values,
    }),
  )

  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  new TaskManager(gs, em, rm, abilityRegistry)

  return { gs, em, rm, events }
}

const windowOf = (gs: GameState, type: ReactionWindowType) =>
  gs.getFrameByWindowType(type)?.frame.windows.find((w) => w.getType() === type)

const payloadsOf = (events: IGameEvent[], type: GameEventType) =>
  events
    .filter((e) => e.getType() === type)
    .map((e) => e.getPayload() as Record<string, unknown>)

/** p1 rolls on their hero, then p2 plays the modifier at that roll, naming `value`. */
function rollAndPlayModifier(values: number[], value = values[0]) {
  const ctx = setup(values)
  jest.spyOn(Math, 'random').mockReturnValue(LOW)
  new RollOnHeroAction('a1', 'p1', HERO, ctx.em, ctx.rm).execute(ctx.gs)
  const result = ctx.rm.submitReaction(
    new PlayModifierReaction('r1', 'p2', MOD, value),
  )
  return { ...ctx, result }
}

const openedValueChoices = (events: IGameEvent[]) =>
  payloadsOf(events, GameEventType.ReactionWindowOpened).filter(
    (p) => p['windowType'] === ReactionWindowType.ValueChoice,
  )

describe('ModifierAbility', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('is registered against every printed copy', () => {
    expect(abilityRegistry.get('modifier-077')).toBe(ModifierAbility)
    expect(abilityRegistry.get('modifier-101')).toBe(ModifierAbility)
    // 25 printed copies, one declaration.
    const ids = [...abilityRegistry.entries()]
      .filter(([, ability]) => ability === ModifierAbility)
      .map(([id]) => id)
    expect(ids).toHaveLength(25)
  })

  it('is ONE entry of ONE step, on the card being played', () => {
    expect(ModifierAbility).toHaveLength(1)
    expect(ModifierAbility[0].trigger.on).toBe(GameEventType.ModifierPlayed)
    expect(ModifierAbility[0].steps).toHaveLength(1)
  })

  it('lands the value the play named, at once, with no window', () => {
    const { events, result } = rollAndPlayModifier([2, -2], -2)

    expect(result).toEqual({ accepted: true })
    expect(openedValueChoices(events)).toEqual([])
    const applied = payloadsOf(events, GameEventType.ModifierApplied)
    expect(applied).toHaveLength(1)
    expect(applied[0]).toMatchObject({ cardId: MOD, value: -2, finalRoll: 0 })
  })

  it('lands the other printed value just as happily', () => {
    const { events } = rollAndPlayModifier([2, -2], 2)

    expect(payloadsOf(events, GameEventType.ModifierApplied)[0]).toMatchObject({
      value: 2,
      finalRoll: 4,
    })
  })

  it('refuses a number the card does not print, before anything is spent', () => {
    const { gs, events, result } = rollAndPlayModifier([2, -2], 99)

    // The value used to arrive checked against nothing; now the card decides.
    expect(result).toEqual({
      accepted: false,
      reason: RefusalReason.ValueNotOnCard,
    })
    expect(payloadsOf(events, GameEventType.ModifierApplied)).toEqual([])
    expect(gs.getPlayer('p2')!.getHand()).toContain(MOD)
  })

  it('rescues a roll the die alone would fail', () => {
    const { events } = rollAndPlayModifier([5]) // 1 + 5 = 6 >= 6
    jest.advanceTimersByTime(5000) // the roll settles

    expect(events.map((e) => e.getType())).toContain(GameEventType.RollSuccess)
  })

  // =========================================================================
  // Where the card IS while all that happens
  // =========================================================================

  describe('the instance zone', () => {
    it('sits in its owner instance pile while the roll is open', () => {
      const { gs } = rollAndPlayModifier([5])

      expect(gs.getParty('p2').getInstanceCardIds()).toContain(MOD)
      expect(gs.getDiscardPile().getAll()).not.toContain(MOD)
    })

    it('stays there after its own ability has finished', () => {
      const { gs, events } = rollAndPlayModifier([5])

      // AbilityDone fired, but the card belongs to the roll until the roll is
      // over — its run finishing is not its time on the table finishing.
      expect(events.map((e) => e.getType())).toContain(GameEventType.AbilityDone)
      expect(gs.getParty('p2').getInstanceCardIds()).toContain(MOD)
      expect(gs.getDiscardPile().getAll()).not.toContain(MOD)
    })

    it('is discarded when the roll SUCCEEDS and the frame is released', () => {
      const { gs } = rollAndPlayModifier([5]) // 1 + 5 = 6, clears
      jest.advanceTimersByTime(5000)

      expect(gs.getParty('p2').getInstanceCardIds()).not.toContain(MOD)
      expect(gs.getDiscardPile().getAll()).toContain(MOD)
    })

    it('is discarded when the roll FAILS and the frame rolls back', () => {
      const { gs } = rollAndPlayModifier([1]) // 1 + 1 = 2, misses 6
      jest.advanceTimersByTime(5000)

      // The snapshot predates the burn, so the rollback hands the card back to
      // p2's hand — and restoreFrame's disposeSpent takes it away again.
      expect(gs.getParty('p2').getInstanceCardIds()).not.toContain(MOD)
      expect(gs.getDiscardPile().getAll()).toContain(MOD)
    })

    it('never returns to the hand on either path', () => {
      const { gs } = rollAndPlayModifier([1])
      jest.advanceTimersByTime(5000)

      expect(gs.getPlayer('p2')!.getHand()).not.toContain(MOD)
    })
  })
})
