import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  ReactionWindowType,
} from 'shared'
import { ProtectingHornAbility } from './protecting-horn-ability'
import { abilityRegistry } from './index'
import { GameState } from '../../pipelines/game-state'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { HeroCard } from '../../cards/hero-card'
import { ModifierCard } from '../../cards/modifier-card'
import { PartyLeaderCard } from '../../cards/party-leader-card'
import { IReactionWindow } from '../../interfaces'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { RollOnHeroAction } from '../../actions/roll-on-hero-action'
import { PlayModifierReaction } from '../../reactions/play-modifier-reaction'

// ---------------------------------------------------------------------------
// The Protecting Horn (leader-121) — "Each time you play a Modifier card on a
// roll, +1 or -1 to that roll."
//
// The same two steps a modifier card runs, with the numbers passed in. Two
// bonuses land on one roll: the card's and the leader's.
//
//   hero roll = ceil(random * 11) + 1  -> 0 => 1
//   hero-1 needs 6.
// ---------------------------------------------------------------------------

const HORN = 'leader-121'
const PLAIN = 'leader-117' // no entry — the control
const MOD = 'modifier-077'
const HERO = 'hero-1'

const LOW = 0 // baseRoll 1

function setup(leaderId: string, values: number[] = [2, -2]) {
  const gs = new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

  gs.registerPlayer(
    new Player({
      id: 'p1',
      name: 'p1',
      hand: [MOD],
      partyId: 'p1-party',
      actionPoints: 3,
    }),
  )
  gs.registerParty(
    new Party({
      playerId: 'p1',
      leaderId,
      heroIds: [HERO],
      monsterIds: [],
    }),
  )
  gs.registerCard(
    new PartyLeaderCard({
      id: leaderId,
      name: leaderId,
      type: CardType.Leader,
      image: '',
      description: '',
      set: 'base',
      heroClass: HeroClass.Guardian,
    }),
  )
  gs.setCurrentPlayerId('p1')

  gs.registerCard(
    new HeroCard({
      id: HERO,
      name: HERO,
      type: CardType.Hero,
      image: '',
      description: '',
      set: 'base',
      heroClass: HeroClass.Guardian,
      rollReq: 6,
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

const valueChoice = (gs: GameState): IReactionWindow | undefined =>
  gs
    .getFrameByWindowType(ReactionWindowType.ValueChoice)
    ?.frame.windows.find((w) => w.getType() === ReactionWindowType.ValueChoice)

const payloadsOf = (events: IGameEvent[], type: GameEventType) =>
  events
    .filter((e) => e.getType() === type)
    .map((e) => e.getPayload() as Record<string, unknown>)

const openedValueChoices = (events: IGameEvent[]) =>
  payloadsOf(events, GameEventType.ReactionWindowOpened).filter(
    (p) => p['windowType'] === ReactionWindowType.ValueChoice,
  )

/** p1 rolls on their hero and pushes it with their own modifier card. */
function rollAndPlayModifier(leaderId: string, values: number[] = [2, -2]) {
  const ctx = setup(leaderId, values)
  jest.spyOn(Math, 'random').mockReturnValue(LOW)
  new RollOnHeroAction('a1', 'p1', HERO, ctx.em, ctx.rm).execute(ctx.gs)
  ctx.rm.submitReaction(new PlayModifierReaction('r1', 'p1', MOD, values[0]))
  return ctx
}

describe('ProtectingHornAbility', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('is registered against the leader card id', () => {
    expect(abilityRegistry.get(HORN)).toBe(ProtectingHornAbility)
  })

  it('rides the modifier being played, not the leader being anything', () => {
    expect(ProtectingHornAbility).toHaveLength(1)
    expect(ProtectingHornAbility[0].trigger.on).toBe(
      GameEventType.ModifierPlayed,
    )
  })

  it('asks its own two numbers; the card\'s value came with the play', () => {
    const { gs, events } = rollAndPlayModifier(HORN)

    // The card lands its own value first (TaskManager runs the event's named
    // card before the onlookers), then the Horn asks for its own.
    expect(openedValueChoices(events)).toHaveLength(1)
    expect(openedValueChoices(events)[0]['options']).toEqual([1, -1])

    valueChoice(gs)!.submitReaction('p1', { choice: 1 })

    // The card's number came with the play; nobody is asked for it.
    expect(openedValueChoices(events)).toHaveLength(1)
  })

  it('lands BOTH bonuses on the one roll', () => {
    const { gs, events } = rollAndPlayModifier(HORN)

    valueChoice(gs)!.submitReaction('p1', { choice: 1 }) // the Horn's

    const applied = payloadsOf(events, GameEventType.ModifierApplied)
    expect(applied).toHaveLength(2)
    // Each names its own source, so the roll can be shown broken down. The
    // card the event names goes first; the Horn is watching it.
    expect(applied.map((p) => [p['cardId'], p['value']])).toEqual([
      [MOD, 2],
      [HORN, 1],
    ])
    expect(applied[1]['finalRoll']).toBe(5) // 1 base + 1 Horn + 2 card
  })

  it('can push the roll DOWN — "+1 or -1", the player chooses', () => {
    const { gs, events } = rollAndPlayModifier(HORN)

    valueChoice(gs)!.submitReaction('p1', { choice: -1 })

    const applied = payloadsOf(events, GameEventType.ModifierApplied)
    expect(applied[1]['finalRoll']).toBe(3) // 1 base - 1 Horn + 2 card
  })

  it('is what turns a roll the card alone could not rescue', () => {
    const { gs, events } = rollAndPlayModifier(HORN, [3]) // 1 + 4 = 5, one short
    valueChoice(gs)!.submitReaction('p1', { choice: 1 }) // 5 + 1 = 6, clears
    jest.advanceTimersByTime(3000) // the card's single value settles
    jest.advanceTimersByTime(5000) // the roll settles

    expect(events.map((e) => e.getType())).toContain(GameEventType.RollSuccess)
  })

  it('without the Horn the same roll falls short', () => {
    const { events } = rollAndPlayModifier(PLAIN, [3]) // 1 + 4 = 5 < 6
    jest.advanceTimersByTime(3000)
    jest.advanceTimersByTime(5000)

    expect(openedValueChoices(events)).toHaveLength(0) // nobody asks: the value came with the play
    expect(events.map((e) => e.getType())).not.toContain(
      GameEventType.RollSuccess,
    )
  })

  it('grants its bonus without spending anything — a leader is not a card in hand', () => {
    const { gs } = rollAndPlayModifier(HORN)
    valueChoice(gs)!.submitReaction('p1', { choice: 1 })

    expect(gs.getParty('p1').getLeaderId()).toBe(HORN)
    expect(gs.getParty('p1').getInstanceCardIds()).not.toContain(HORN)
    expect(gs.getDiscardPile().getAll()).not.toContain(HORN)
  })

  it('does not fire when nobody plays a modifier', () => {
    const ctx = setup(HORN)
    jest.spyOn(Math, 'random').mockReturnValue(LOW)
    new RollOnHeroAction('a1', 'p1', HERO, ctx.em, ctx.rm).execute(ctx.gs)

    expect(openedValueChoices(ctx.events)).toEqual([])
  })
})
