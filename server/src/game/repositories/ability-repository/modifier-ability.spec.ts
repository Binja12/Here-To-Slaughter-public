import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  ReactionWindowType,
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
import { IReactionWindow } from '../../interfaces'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { RollOnHeroAction } from '../../actions/roll-on-hero-action'
import { PlayModifierReaction } from '../../reactions/play-modifier-reaction'

// ---------------------------------------------------------------------------
// Modifier (modifier-077 …) — what the card is WORTH, as a registry entry.
//
// The reaction spends the card; this decides the number and lands it. The two
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

const valueChoice = (gs: GameState): IReactionWindow | undefined =>
  windowOf(gs, ReactionWindowType.ValueChoice)

const payloadsOf = (events: IGameEvent[], type: GameEventType) =>
  events
    .filter((e) => e.getType() === type)
    .map((e) => e.getPayload() as Record<string, unknown>)

/** p1 rolls on their hero, then p2 plays the modifier at that roll. */
function rollAndPlayModifier(values: number[]) {
  const ctx = setup(values)
  jest.spyOn(Math, 'random').mockReturnValue(LOW)
  new RollOnHeroAction('a1', 'p1', HERO, ctx.em, ctx.rm).execute(ctx.gs)
  ctx.rm.submitReaction(new PlayModifierReaction('r1', 'p2', MOD, 'p1'))
  return ctx
}

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

  it('is ONE entry, on the card being played', () => {
    expect(ModifierAbility).toHaveLength(1)
    expect(ModifierAbility[0].trigger.on).toBe(GameEventType.ModifierPlayed)
  })

  it('offers the card its OWN printed values', () => {
    const { events } = rollAndPlayModifier([2, -2])

    const opened = payloadsOf(events, GameEventType.ReactionWindowOpened).find(
      (p) => p['windowType'] === ReactionWindowType.ValueChoice,
    )
    expect(opened?.['options']).toEqual([2, -2])
    // Asked of the player who spent the card, not the one being rolled at.
    expect(opened?.['respondentId']).toBe('p2')
  })

  it('lands the value the player picked', () => {
    const { gs, events } = rollAndPlayModifier([2, -2])

    valueChoice(gs)!.submitReaction('p2', { choice: -2 })

    const applied = payloadsOf(events, GameEventType.ModifierApplied)
    expect(applied).toHaveLength(1)
    expect(applied[0]).toMatchObject({ cardId: MOD, value: -2, finalRoll: -1 })
  })

  it('lands the other one just as happily', () => {
    const { gs, events } = rollAndPlayModifier([2, -2])

    valueChoice(gs)!.submitReaction('p2', { choice: 2 })

    expect(payloadsOf(events, GameEventType.ModifierApplied)[0]).toMatchObject({
      value: 2,
      finalRoll: 3,
    })
  })

  it('refuses a number the card does not print', () => {
    const { gs, events } = rollAndPlayModifier([2, -2])

    // The whole point of moving the value off the reaction: it used to arrive
    // as a constructor argument, checked against nothing.
    valueChoice(gs)!.submitReaction('p2', { choice: 99 })

    expect(payloadsOf(events, GameEventType.ModifierApplied)).toEqual([])
    expect(valueChoice(gs)).toBeDefined() // still waiting for a legal pick
  })

  it('an idle player still lands one — the card is already spent', () => {
    const { gs, events } = rollAndPlayModifier([5])
    jest.advanceTimersByTime(3000)

    expect(payloadsOf(events, GameEventType.ModifierApplied)[0]).toMatchObject({
      value: 5,
    })
    expect(valueChoice(gs)).toBeUndefined()
  })

  // =========================================================================
  // Which way silence falls
  //
  // Not random, the way a CARD choice defaults: a number has a direction, and
  // the direction is derivable from what the player aimed at. The window being
  // modified owns the rule — see IModifiableWindow.valueBiasFor.
  // =========================================================================

  describe('the silent default', () => {
    it('a bonus on ANOTHER player roll falls to the lowest value', () => {
      // p2 spent it on p1's roll: they meant to spoil it.
      const { events } = rollAndPlayModifier([2, -2])
      jest.advanceTimersByTime(3000)

      expect(payloadsOf(events, GameEventType.ModifierApplied)[0]).toMatchObject(
        { value: -2 },
      )
    })

    it('a bonus on your OWN roll falls to the highest value', () => {
      const ctx = setup([2, -2])
      jest.spyOn(Math, 'random').mockReturnValue(LOW)
      new RollOnHeroAction('a1', 'p1', HERO, ctx.em, ctx.rm).execute(ctx.gs)
      // p1 rolls and p1 pushes it: they meant to help it.
      ctx.gs.getPlayer('p1')!.addToHand(MOD)
      ctx.gs.getPlayer('p2')!.removeFromHand(MOD)
      ctx.rm.submitReaction(new PlayModifierReaction('r1', 'p1', MOD, 'p1'))
      jest.advanceTimersByTime(3000)

      expect(
        payloadsOf(ctx.events, GameEventType.ModifierApplied)[0],
      ).toMatchObject({ value: 2 })
    })

    it('rides in the opened payload, so the table can see it coming', () => {
      const { events } = rollAndPlayModifier([2, -2])

      const opened = payloadsOf(events, GameEventType.ReactionWindowOpened).find(
        (p) => p['windowType'] === ReactionWindowType.ValueChoice,
      )
      expect(opened?.['bias']).toBe('lowest')
    })

    it('a picked value beats the default either way', () => {
      const { gs, events } = rollAndPlayModifier([2, -2])

      valueChoice(gs)!.submitReaction('p2', { choice: 2 })

      expect(payloadsOf(events, GameEventType.ModifierApplied)[0]).toMatchObject(
        { value: 2 },
      )
    })
  })

  it('rescues a roll the die alone would fail', () => {
    const { gs, events } = rollAndPlayModifier([5]) // 1 + 5 = 6 >= 6
    jest.advanceTimersByTime(3000) // the value settles
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
      const { gs } = rollAndPlayModifier([5])
      jest.advanceTimersByTime(3000) // value picked, bonus landed, entry done

      // AbilityDone fired, but the card belongs to the roll until the roll is
      // over — its run finishing is not its time on the table finishing.
      expect(gs.getParty('p2').getInstanceCardIds()).toContain(MOD)
      expect(gs.getDiscardPile().getAll()).not.toContain(MOD)
    })

    it('is discarded when the roll SUCCEEDS and the frame is released', () => {
      const { gs } = rollAndPlayModifier([5]) // 1 + 5 = 6, clears
      jest.advanceTimersByTime(3000)
      jest.advanceTimersByTime(5000)

      expect(gs.getParty('p2').getInstanceCardIds()).not.toContain(MOD)
      expect(gs.getDiscardPile().getAll()).toContain(MOD)
    })

    it('is discarded when the roll FAILS and the frame rolls back', () => {
      const { gs } = rollAndPlayModifier([1]) // 1 + 1 = 2, misses 6
      jest.advanceTimersByTime(3000)
      jest.advanceTimersByTime(5000)

      // The snapshot predates the burn, so the rollback hands the card back to
      // p2's hand — and restoreFrame's disposeSpent takes it away again.
      expect(gs.getParty('p2').getInstanceCardIds()).not.toContain(MOD)
      expect(gs.getDiscardPile().getAll()).toContain(MOD)
    })

    it('never returns to the hand on either path', () => {
      const { gs } = rollAndPlayModifier([1])
      jest.advanceTimersByTime(3000)
      jest.advanceTimersByTime(5000)

      expect(gs.getPlayer('p2')!.getHand()).not.toContain(MOD)
    })
  })
})
