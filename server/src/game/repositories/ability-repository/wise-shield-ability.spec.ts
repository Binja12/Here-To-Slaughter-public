import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  PassiveType,
  ReactionWindowType,
} from 'shared'
import { GameState } from '../../pipelines/game-state'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { HeroCard } from '../../cards/hero-card'
import { ModifierCard } from '../../cards/modifier-card'
import { ChallengeCard } from '../../cards/challenge-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { TurnManager } from '../../pipelines/turn-manager'
import { GameEngine } from '../../game-engine'
import { PlayHeroAction } from '../../actions/play-hero-action'
import { RollOnHeroAction } from '../../actions/roll-on-hero-action'
import { PlayChallengeReaction } from '../../reactions/play-challenge-reaction'
import { PlayModifierReaction } from '../../reactions/play-modifier-reaction'
import { abilityRegistry } from './index'
import { CONFIRM } from '../../reactions/task-choice-window'
import { IReactionWindow } from '../../interfaces'

// ---------------------------------------------------------------------------
// Wise Shield (hero-028) — full life cycle, through the real wiring
// (TurnManager, GameEngine and the real abilityRegistry).
//
//   play hero -> challenge -> "roll?" offer -> roll -> modifier window
//   -> RollSuccess -> +3 installed -> next roll sees it -> TurnEnded sweeps it
//
//   baseRoll       = ceil(random * 11) + 1   -> 0 => 1, 0.99 => 12
//   challenge roll = floor(random * 11) + 1  -> 0 => 1, 0.99 => 11
//   hero-028 rollReq is 6.
// ---------------------------------------------------------------------------

const WISE_SHIELD = 'hero-028'
const ROLL_REQ = 6

// Real printed ids, so the registry's ChallengeAbility and ModifierAbility run:
// what these cards DO is their own entry now, not the reaction's argument. The
// modifier's single printed value is the test's own — behaviour is keyed by id.
const CHAL = 'challenge-102'
const MOD = 'modifier-077'

const LOW = 0 // baseRoll 1  — misses rollReq 6
const HIGH = 0.99 // baseRoll 12 — clears rollReq 6

const makeGs = () =>
  new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

const makeHero = (id: string, rollReq = ROLL_REQ) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'base',
    heroClass: HeroClass.Guardian,
    rollReq,
  })

function seat(gs: GameState, playerId: string, hand: string[] = [], ap = 3) {
  gs.registerPlayer(
    new Player({
      id: playerId,
      name: playerId,
      hand,
      partyId: playerId + '-party',
      actionPoints: ap,
    }),
  )
  gs.registerParty(
    new Party({
      playerId,
      leaderId: playerId + '-leader',
      heroIds: [],
      monsterIds: [],
    }),
  )
}

function setup() {
  const gs = makeGs()
  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })

  const rm = new ReactionManager(gs, em)
  const tm = new TurnManager(gs, em)
  new TaskManager(gs, em, rm, abilityRegistry)
  const engine = new GameEngine(gs, tm, em, [])

  seat(gs, 'p1', [WISE_SHIELD, 'hero-777'])
  seat(gs, 'p2', [CHAL, MOD])

  gs.registerCard(makeHero(WISE_SHIELD))
  gs.registerCard(makeHero('hero-777'))
  gs.registerCard(
    new ChallengeCard({
      id: CHAL,
      name: 'Challenge',
      type: CardType.Challenge,
      image: '',
      description: '',
      set: 'base',
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
      values: [5],
    }),
  )

  engine.start(['p1', 'p2'])
  return { gs, em, rm, tm, events }
}

// --- accessors --------------------------------------------------------------

const windowOf = (
  gs: GameState,
  type: ReactionWindowType,
): IReactionWindow | undefined =>
  gs.getFrameByWindowType(type)?.frame.windows.find((w) => w.getType() === type)

const challengeWindow = (gs: GameState) =>
  windowOf(gs, ReactionWindowType.Challenge)
const modifierWindow = (gs: GameState) =>
  windowOf(gs, ReactionWindowType.Modifier)
const rollOffer = (gs: GameState) => windowOf(gs, ReactionWindowType.TaskChoice)

/**
 * Every hero offers a roll once a challenge on it settles (hero-rules.ts).
 * Saying yes is what puts RollOnHeroTask on the stack.
 */
const acceptRollOffer = (gs: GameState) =>
  rollOffer(gs)!.submitReaction('p1', { choice: CONFIRM })

const typesOf = (events: IGameEvent[]) => events.map((e) => e.getType())

/**
 * A played modifier's value comes with the play and lands inside the same
 * emission, so this is a plain wait now: shorter than the roll it sits in.
 */
const settleValueChoice = () => jest.advanceTimersByTime(3000)

/** Total RollBonus currently on a player — the entries, summed. */
const rollBonus = (gs: GameState, playerId: string) =>
  gs
    .getEffects(PassiveType.RollBonus, playerId)
    .reduce((sum, e) => sum + (e.value ?? 0), 0)

/** Which cards are granting a player a roll bonus right now. */
const rollBonusSources = (gs: GameState, playerId: string) =>
  gs
    .getEffects(PassiveType.RollBonus, playerId)
    .map((e) => e.sourceCardId)

const payloadsOf = (events: IGameEvent[], type: GameEventType) =>
  events
    .filter((e) => e.getType() === type)
    .map((e) => e.getPayload() as Record<string, unknown>)

/** ReactionWindowOpened payloads belonging to modifier windows, oldest first. */
const modifierOpenPayloads = (events: IGameEvent[]) =>
  payloadsOf(events, GameEventType.ReactionWindowOpened).filter(
    (p) => p['windowType'] === ReactionWindowType.Modifier,
  )

describe('Wise Shield — full life cycle', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  const playWiseShield = (
    gs: GameState,
    em: GameEventEmitter,
    rm: ReactionManager,
    tm: TurnManager,
  ) => tm.enqueue(new PlayHeroAction('a1', 'p1', WISE_SHIELD, rm, em))

  // =========================================================================
  // STAGE 1 — playing the hero opens a challenge window and parks the roll
  // =========================================================================

  describe('stage 1: play the hero', () => {
    it('spends the action point and takes the card out of hand', () => {
      const { gs, em, rm, tm } = setup()
      playWiseShield(gs, em, rm, tm)
      expect(gs.getPlayer('p1')!.getActionPoints()).toBe(2)
      expect(gs.getPlayer('p1')!.getHand()).not.toContain(WISE_SHIELD)
    })

    it('puts the hero in the party and opens a challenge window', () => {
      const { gs, em, rm, tm } = setup()
      playWiseShield(gs, em, rm, tm)
      expect(gs.getParty('p1').getHeroIds()).toContain(WISE_SHIELD)
      expect(challengeWindow(gs)).toBeDefined()
    })

    it('offers nothing yet — no roll and no prompt while the challenge is open', () => {
      const { gs, em, rm, tm } = setup()
      playWiseShield(gs, em, rm, tm)
      // The offer hangs off the SETTLED challenge frame, and the play queues
      // no action of its own — the roll it leads to is a task.
      expect(rollOffer(gs)).toBeUndefined()
      expect(modifierWindow(gs)).toBeUndefined()
    })

    it('snapshots between the hand removal and the party arrival', () => {
      const { gs, em, rm, tm } = setup()
      playWiseShield(gs, em, rm, tm)
      const { frame } = gs.getFrameByWindowType(ReactionWindowType.Challenge)!
      expect(frame.snapshot.board.getPlayer('p1')!.getHand()).not.toContain(WISE_SHIELD)
      expect(frame.snapshot.board.getParty('p1').getHeroIds()).not.toContain(WISE_SHIELD)
    })
  })

  // =========================================================================
  // STAGE 2 — the challenge settles, and only then does the roll run
  // =========================================================================

  describe('stage 2: challenge settles', () => {
    it('uncontested: the hero is asked whether to roll', () => {
      const { gs, em, rm, tm } = setup()
      playWiseShield(gs, em, rm, tm)

      jest.spyOn(Math, 'random').mockReturnValue(HIGH)
      jest.advanceTimersByTime(5000) // challenge lapses unchallenged

      expect(gs.getParty('p1').getHeroIds()).toContain(WISE_SHIELD)
      expect(rollOffer(gs)).toBeDefined()
      expect(modifierWindow(gs)).toBeUndefined()
    })

    it('uncontested: saying yes runs the roll and opens a modifier window', () => {
      const { gs, em, rm, tm } = setup()
      playWiseShield(gs, em, rm, tm)

      jest.spyOn(Math, 'random').mockReturnValue(HIGH)
      jest.advanceTimersByTime(5000)
      acceptRollOffer(gs)

      expect(modifierWindow(gs)).toBeDefined()
    })

    it('uncontested: saying no leaves the hero in the party, unrolled', () => {
      const { gs, em, rm, tm } = setup()
      playWiseShield(gs, em, rm, tm)

      jest.spyOn(Math, 'random').mockReturnValue(HIGH)
      jest.advanceTimersByTime(5000)
      jest.advanceTimersByTime(5000) // the offer lapses, which is a DISMISS

      expect(gs.getParty('p1').getHeroIds()).toContain(WISE_SHIELD)
      expect(modifierWindow(gs)).toBeUndefined()
      expect(gs.getAbilitiesUsedThisTurn()).not.toContain(WISE_SHIELD)
    })

    it('challenged and WON: hero stays, and the roll is still offered', () => {
      const { gs, em, rm, tm } = setup()
      playWiseShield(gs, em, rm, tm)

      // challenger rolls 1, challenged rolls 11 -> challenged wins
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(LOW).mockReturnValueOnce(LOW)
        .mockReturnValueOnce(HIGH).mockReturnValueOnce(HIGH)
        .mockReturnValue(HIGH)
      rm.submitReaction(
        new PlayChallengeReaction('r1', 'p2', CHAL, WISE_SHIELD),
      )
      jest.advanceTimersByTime(5000)

      expect(gs.getParty('p1').getHeroIds()).toContain(WISE_SHIELD)
      acceptRollOffer(gs)
      expect(modifierWindow(gs)).toBeDefined()
    })

    it('challenged and LOST: hero un-played, never offered a roll', () => {
      const { gs, em, rm, tm } = setup()
      playWiseShield(gs, em, rm, tm)

      // challenger rolls 11, challenged rolls 1 -> challenger wins
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(HIGH).mockReturnValueOnce(HIGH)
        .mockReturnValueOnce(LOW).mockReturnValueOnce(LOW)
        .mockReturnValue(LOW)
      rm.submitReaction(
        new PlayChallengeReaction('r1', 'p2', CHAL, WISE_SHIELD),
      )
      jest.advanceTimersByTime(5000)

      expect(gs.getParty('p1').getHeroIds()).not.toContain(WISE_SHIELD)
      expect(gs.getPlayer('p1')!.getHand()).not.toContain(WISE_SHIELD) // spent either way
      // Rolled back out of the party before FrameResolved went out, so it was
      // not among the sources the offer is matched against.
      expect(rollOffer(gs)).toBeUndefined()
      expect(modifierWindow(gs)).toBeUndefined()
    })

    it('challenged and LOST: the card lands in the DISCARD, not nowhere', () => {
      const { gs, em, rm, tm } = setup()
      playWiseShield(gs, em, rm, tm)

      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(HIGH).mockReturnValueOnce(HIGH)
        .mockReturnValueOnce(LOW).mockReturnValueOnce(LOW)
        .mockReturnValue(LOW)
      rm.submitReaction(
        new PlayChallengeReaction('r1', 'p2', CHAL, WISE_SHIELD),
      )
      jest.advanceTimersByTime(5000)

      // Removed from hand before the snapshot, so only an explicit discard
      // keeps it in the game.
      expect(gs.getDiscardPile().getAll()).toContain(WISE_SHIELD)
      expect(gs.getDiscardPile().getAll()).toContain(CHAL)
    })

    it('challenged and WON: the card is marked, so it cannot be challenged again', () => {
      const { gs, em, rm, tm } = setup()
      playWiseShield(gs, em, rm, tm)

      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(LOW).mockReturnValueOnce(LOW)
        .mockReturnValueOnce(HIGH).mockReturnValueOnce(HIGH)
        .mockReturnValue(HIGH)
      rm.submitReaction(
        new PlayChallengeReaction('r1', 'p2', CHAL, WISE_SHIELD),
      )
      jest.advanceTimersByTime(5000)

      expect(gs.getCardsChallengedThisTurn()).toContain(WISE_SHIELD)
    })

    it('challenged and LOST: no RollSuccess, no effect', () => {
      const { gs, em, rm, tm, events } = setup()
      playWiseShield(gs, em, rm, tm)

      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(HIGH).mockReturnValueOnce(HIGH)
        .mockReturnValueOnce(LOW).mockReturnValueOnce(LOW)
        .mockReturnValue(LOW)
      rm.submitReaction(
        new PlayChallengeReaction('r1', 'p2', CHAL, WISE_SHIELD),
      )
      jest.advanceTimersByTime(5000)

      expect(typesOf(events)).not.toContain(GameEventType.RollSuccess)
      expect(rollBonus(gs, 'p1')).toBe(0)
    })
  })

  // =========================================================================
  // STAGE 3 — the granted roll, with and without modifier cards
  // =========================================================================

  describe('stage 3: the granted roll', () => {
    /** Play the hero, let the challenge lapse; leaves the modifier window open. */
    const toModifierWindow = (baseRollRandom: number) => {
      const ctx = setup()
      playWiseShield(ctx.gs, ctx.em, ctx.rm, ctx.tm)
      jest.spyOn(Math, 'random').mockReturnValue(baseRollRandom)
      jest.advanceTimersByTime(5000) // challenge lapses
      acceptRollOffer(ctx.gs)
      return ctx
    }




    it('FAILED roll, no modifiers: no RollSuccess, no effect installed', () => {
      const { gs, events } = toModifierWindow(LOW) // baseRoll 1 < 6
      jest.advanceTimersByTime(5000)

      expect(typesOf(events)).not.toContain(GameEventType.RollSuccess)
      expect(rollBonus(gs, 'p1')).toBe(0)
    })

    it('FAILED roll is rolled back, but the hero survives it', () => {
      const { gs } = toModifierWindow(LOW)
      jest.advanceTimersByTime(5000)
      // The roll's frame opened AFTER the hero joined, so rollback keeps it.
      expect(gs.getParty('p1').getHeroIds()).toContain(WISE_SHIELD)
    })

    it('FAILED roll rescued by a modifier: RollSuccess fires and the effect installs', () => {
      const { gs, rm, events } = toModifierWindow(LOW) // baseRoll 1
      rm.submitReaction(new PlayModifierReaction('r2', 'p2', MOD, 'p1', 5)) // 1 + 5 = 6
      settleValueChoice()
      jest.advanceTimersByTime(5000)

      expect(typesOf(events)).toContain(GameEventType.RollSuccess)
      expect(rollBonus(gs, 'p1')).toBe(3)
    })

    it('SUCCESSFUL roll, no modifiers: the ability installs +3', () => {
      const { gs, events } = toModifierWindow(HIGH) // baseRoll 12
      jest.advanceTimersByTime(5000)

      expect(typesOf(events)).toContain(GameEventType.RollSuccess)
      expect(typesOf(events)).toContain(GameEventType.EffectApplied)
      expect(rollBonus(gs, 'p1')).toBe(3)
      expect(rollBonusSources(gs, 'p1')).toEqual([WISE_SHIELD])
    })

    it('the +3 does NOT boost the roll that earned it', () => {
      const { events } = toModifierWindow(HIGH)
      const opened = modifierOpenPayloads(events)
      expect(opened).toHaveLength(1)
      expect(opened[0]['bonuses']).toEqual([]) // nothing standing yet
      expect(opened[0]['finalRoll']).toBe(12)
    })

    it('a played modifier is recorded against the card that paid for it', () => {
      const { rm, events } = toModifierWindow(LOW)
      rm.submitReaction(new PlayModifierReaction('r2', 'p2', MOD, 'p1', 5))
      settleValueChoice()

      const applied = payloadsOf(events, GameEventType.ModifierApplied)
      expect(applied).toHaveLength(1)
      expect(applied[0]['cardId']).toBe(MOD)
      expect(applied[0]['finalRoll']).toBe(7) // 2 + 5
    })
  })

  // =========================================================================
  // STAGE 4 — the bonus is visible the moment the NEXT window opens
  // =========================================================================

  describe('stage 4: the bonus applies to later rolls', () => {
    /** Wise Shield in play with its +3 installed, plus a second hero to roll on. */
    const armed = (secondHeroRollReq: number) => {
      const ctx = setup()
      playWiseShield(ctx.gs, ctx.em, ctx.rm, ctx.tm)
      jest.spyOn(Math, 'random').mockReturnValue(HIGH)
      jest.advanceTimersByTime(5000) // challenge lapses -> the roll is offered
      acceptRollOffer(ctx.gs) // yes -> the roll runs
      jest.advanceTimersByTime(5000) // modifier window settles -> +3 installed
      expect(rollBonus(ctx.gs, 'p1')).toBe(3)

      ctx.gs.registerCard(makeHero('hero-099', secondHeroRollReq))
      ctx.gs.getParty('p1').addHero('hero-099', ctx.em, 'Played')
      return ctx
    }

    it('announces base roll and bonus separately when the window OPENS', () => {
      const { em, rm, tm, events } = armed(10)

      jest.spyOn(Math, 'random').mockReturnValue(LOW) // baseRoll 1
      tm.enqueue(new RollOnHeroAction('a2', 'p1', 'hero-099', em, rm))

      const opened = modifierOpenPayloads(events)
      const latest = opened[opened.length - 1]
      expect(latest['baseRoll']).toBe(2) // the raw die, unchanged
      expect(latest['finalRoll']).toBe(5) // 1 + 3, before any modifier card
      // One list, but every entry says which card it came from — that is what
      // lets the UI show "+3 Wise Shield" instead of an unattributable "+3".
      expect(latest['bonuses']).toEqual([{ cardSource: WISE_SHIELD, amount: 3 }])
    })

    it('applies to a CHALLENGE roll — "+3 to all of your rolls" means all of them', () => {
      const { gs, em, rm, tm, events } = armed(10)

      // Play a second hero; p2 challenges it.
      tm.enqueue(new PlayHeroAction('a3', 'p1', 'hero-777', rm, em))
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0.5).mockReturnValueOnce(0.5) // challenger p2 rolls 6
        .mockReturnValueOnce(0.4).mockReturnValueOnce(0.4) // challenged p1 rolls 5
        .mockReturnValue(LOW) // whatever the granted roll needs afterwards
      rm.submitReaction(new PlayChallengeReaction('r3', 'p2', CHAL, 'hero-777'))
      jest.advanceTimersByTime(5000)

      const resolved = payloadsOf(events, GameEventType.ChallengeResolved)
      expect(resolved).toHaveLength(1)
      // 5 on the dice would LOSE to 6; 5 + 3 from Wise Shield wins it.
      expect(resolved[0]).toMatchObject({
        challengerFinal: 8,
        defenderFinal: 9,
        defenderWins: true,
      })
      expect(gs.getParty('p1').getHeroIds()).toContain('hero-777')
    })

    it('a modifier card can be spent on a CHALLENGE roll', () => {
      const { gs, em, rm, tm, events } = armed(10)

      tm.enqueue(new PlayHeroAction('a3', 'p1', 'hero-777', rm, em))
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0.5).mockReturnValueOnce(0.5) // challenger p2 rolls 6
        .mockReturnValueOnce(0).mockReturnValueOnce(0) // challenged p1 rolls 1
        .mockReturnValue(LOW)
      rm.submitReaction(new PlayChallengeReaction('r3', 'p2', CHAL, 'hero-777'))

      // p2 pushes their OWN challenge roll with a +5 modifier.
      rm.submitReaction(new PlayModifierReaction('r4', 'p2', MOD, 'p2', 5))
      settleValueChoice()
      jest.advanceTimersByTime(5000)

      const resolved = payloadsOf(events, GameEventType.ChallengeResolved)
      expect(resolved[0]).toMatchObject({
        challengerFinal: 13, // 6 + 5 from the card
        defenderFinal: 5, // 1 + 3 from Wise Shield
        defenderWins: false,
      })
      expect(gs.getDiscardPile().getAll()).toContain(MOD)
    })

    it('a standing effect and a played card sit in ONE list, each with its source', () => {
      const { em, rm, tm, events } = armed(10)

      jest.spyOn(Math, 'random').mockReturnValue(LOW) // baseRoll 1
      tm.enqueue(new RollOnHeroAction('a2', 'p1', 'hero-099', em, rm))
      rm.submitReaction(new PlayModifierReaction('r2', 'p2', MOD, 'p1', 5))
      settleValueChoice()

      const applied = payloadsOf(events, GameEventType.ModifierApplied)
      const last = applied[applied.length - 1]
      expect(last['cardId']).toBe(MOD)
      expect(last['finalRoll']).toBe(10) // 1 base + 3 Wise Shield + 5 card
    })

    it('turns a roll the die alone would fail into a success', () => {
      const { em, rm, tm, events } = armed(4) // rollReq 4

      const before = events.length
      jest.spyOn(Math, 'random').mockReturnValue(LOW) // baseRoll 1 — would fail 4
      tm.enqueue(new RollOnHeroAction('a2', 'p1', 'hero-099', em, rm))
      jest.advanceTimersByTime(5000)

      // 1 + 3 = 4 >= 4
      expect(typesOf(events.slice(before))).toContain(GameEventType.RollSuccess)
    })
  })

  // =========================================================================
  // STAGE 5 — the effect ends with the turn
  // =========================================================================

  describe('stage 5: expiry', () => {
    it('TurnEnded sweeps the +3 away', () => {
      const { gs, em, rm, tm, events } = setup()
      playWiseShield(gs, em, rm, tm)
      jest.spyOn(Math, 'random').mockReturnValue(HIGH)
      jest.advanceTimersByTime(5000) // challenge lapses -> the roll is offered
      acceptRollOffer(gs)
      jest.advanceTimersByTime(5000) // modifier window settles
      expect(rollBonus(gs, 'p1')).toBe(3)

      tm.endTurn()

      expect(rollBonus(gs, 'p1')).toBe(0)
      expect(typesOf(events)).toContain(GameEventType.EffectExpired)
    })
  })
})
