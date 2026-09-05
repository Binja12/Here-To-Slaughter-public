import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  PassiveType,
  RollCompareMode,
  RollContext,
  ReactionWindowType,
  RollResult,
  TriggerScope,
} from 'shared'
import { CharismaticSongAbility } from './charismatic-song-ability'
import { DivineArrowAbility } from './divine-arrow-ability'
import { FistOfReasonAbility } from './fist-of-reason-ability'
import { abilityRegistry } from './index'
import { GameState } from '../../pipelines/game-state'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { HeroCard } from '../../cards/hero-card'
import { MonsterCard } from '../../cards/monster-card'
import { ChallengeCard } from '../../cards/challenge-card'
import { PartyLeaderCard } from '../../cards/party-leader-card'
import { IReactionWindow } from '../../interfaces'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { TurnManager } from '../../pipelines/turn-manager'
import { GameEngine } from '../../game-engine'
import { AttackMonsterAction } from '../../actions/attack-monster-action'
import { PlayHeroAction } from '../../actions/play-hero-action'
import { RollOnHeroAction } from '../../actions/roll-on-hero-action'
import { PlayChallengeReaction } from '../../reactions/play-challenge-reaction'

// ---------------------------------------------------------------------------
// The three leader passives that differ only by RollContext:
//
//   leader-116 The Divine Arrow      +1 to ATTACK rolls
//   leader-118 The Fist of Reason    +2 to CHALLENGE rolls
//   leader-119 The Charismatic Song  +1 to HERO EFFECT rolls
//
// One declaration shape, three contexts, three roll sites. What is really
// under test is that each reaches its own site and NEITHER OF THE OTHER TWO —
// before the context axis existed, all three would have stacked on every roll.
//
//   hero roll      = ceil(random * 11) + 1   -> 0 => 1, 0.99 => 12
//   challenge roll = floor(random * 11) + 1  -> 0 => 1, 0.99 => 11
//   attack roll    = ceil(random * 11) + 1
// ---------------------------------------------------------------------------

const ARROW = 'leader-116'
const FIST = 'leader-118'
const SONG = 'leader-119'
const PLAIN = 'leader-117' // no entry yet — the control
/** A real printed id, so the registry's ChallengeAbility contests the play. */
const CHAL = 'challenge-102'

const LOW = 0
const HIGH = 0.99

const makeHero = (id: string, rollReq: number) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'base',
    heroClass: HeroClass.Ranger,
    rollReq,
  })

/** Slain on 9+, fights back on 6-, misses in between. */
const makeMonster = (id: string) =>
  new MonsterCard({
    id,
    name: id,
    type: CardType.Monster,
    image: '',
    description: '',
    set: 'base',
    partyReq: { classes: ['Any'] },
    higherReq: 9,
    lowerReq: 6,
    rollCompareMode: RollCompareMode.HighToWin,
  })

/**
 * Two seats, each with the leader named. p1 acts, p2 is the opponent — so a
 * leader's bonus can be checked from both sides of a challenge.
 */
function setup(p1Leader: string, p2Leader: string = PLAIN) {
  const gs = new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

  for (const [playerId, leaderId, hand] of [
    ['p1', p1Leader, ['hero-777']],
    ['p2', p2Leader, [CHAL]],
  ] as const) {
    gs.registerPlayer(
      new Player({
        id: playerId,
        name: playerId,
        hand: [...hand],
        partyId: playerId + '-party',
        actionPoints: 5,
      }),
    )
    gs.registerParty(
      new Party({ playerId, leaderId, heroIds: [], monsterIds: [] }),
    )
    gs.registerCard(
      new PartyLeaderCard({
        id: leaderId,
        name: leaderId,
        type: CardType.Leader,
        image: '',
        description: '',
        set: 'base',
        heroClass: HeroClass.Ranger,
      }),
    )
  }

  gs.registerCard(makeHero('hero-777', 6))
  gs.registerCard(
    new ChallengeCard({
      id: CHAL,
      name: CHAL,
      type: CardType.Challenge,
      image: '',
      description: '',
      set: 'base',
    }),
  )
  gs.registerCard(makeMonster('monster-1'))
  gs.getMonsterPile().add('monster-1')

  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  const tm = new TurnManager(gs, em)
  // Before GameEngine, so the stack is drained by the time the engine hears
  // anything (§8) — and so GameStarted reaches the leaders at all.
  new TaskManager(gs, em, rm, abilityRegistry)
  const engine = new GameEngine(gs, tm, em, [])
  engine.start(['p1', 'p2'])

  return { gs, em, rm, tm, events }
}

const bonusesOf = (gs: GameState, playerId: string) =>
  gs
    .getPlayer(playerId)!
    .getAllEffects()
    .filter((e) => e.type === PassiveType.RollBonus)

const modifierWindow = (gs: GameState): IReactionWindow | undefined =>
  gs
    .getFrameByWindowType(ReactionWindowType.Modifier)
    ?.frame.windows.find((w) => w.getType() === ReactionWindowType.Modifier)

const payloadsOf = (events: IGameEvent[], type: GameEventType) =>
  events
    .filter((e) => e.getType() === type)
    .map((e) => e.getPayload() as Record<string, unknown>)

/** The finalRoll a modifier window announced when it opened. */
const openedRoll = (events: IGameEvent[]) => {
  const opened = payloadsOf(events, GameEventType.ReactionWindowOpened).filter(
    (p) => p['windowType'] === ReactionWindowType.Modifier,
  )
  return opened[opened.length - 1]
}

/** p1 plays a hero, lets the challenge lapse, then rolls on it. */
function rollOnAHero(ctx: ReturnType<typeof setup>, random: number) {
  ctx.tm.enqueue(new PlayHeroAction('a1', 'p1', 'hero-777', ctx.rm, ctx.em))
  jest.spyOn(Math, 'random').mockReturnValue(random)
  jest.advanceTimersByTime(5000) // challenge on the play lapses
  jest.advanceTimersByTime(5000) // the roll offer lapses — we roll deliberately
  ctx.tm.enqueue(new RollOnHeroAction('a2', 'p1', 'hero-777', ctx.em, ctx.rm))
}

describe('leader roll passives', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  // =========================================================================
  // Installation — the one event a leader can hang a passive off
  // =========================================================================

  describe('installed by GameStarted', () => {
    it.each([
      [ARROW, DivineArrowAbility, 1, RollContext.Attack],
      [FIST, FistOfReasonAbility, 2, RollContext.Challenge],
      [SONG, CharismaticSongAbility, 1, RollContext.HeroEffect],
    ])('%s installs its bonus on its own owner', (leader, ability, value, context) => {
      expect(abilityRegistry.get(leader)).toBe(ability)
      expect(ability[0].trigger).toEqual({
        on: GameEventType.GameStarted,
        scope: TriggerScope.Anyone,
      })

      const { gs } = setup(leader)

      expect(bonusesOf(gs, 'p1')).toEqual([
        expect.objectContaining({
          sourceCardId: leader,
          ownerId: 'p1',
          value,
          rollContext: context,
        }),
      ])
      // Anyone matches every leader, but each installs on its own owner only.
      expect(bonusesOf(gs, 'p2')).toEqual([])
    })

    it('is permanent — nothing is declared to expire it', () => {
      const { gs, tm } = setup(SONG)
      tm.endTurn()
      expect(bonusesOf(gs, 'p1')[0].expiry).toBeUndefined()
      expect(bonusesOf(gs, 'p1')).toHaveLength(1)
    })

    it('a leader with no entry installs nothing', () => {
      const { gs } = setup(PLAIN)
      expect(bonusesOf(gs, 'p1')).toEqual([])
    })
  })

  // =========================================================================
  // The Divine Arrow — ATTACK rolls only
  // =========================================================================

  describe('The Divine Arrow (leader-116)', () => {
    /**
     * Attack with a roll of `random`, then let the attack window lapse — the
     * outcome is settled by the window, not by `execute`.
     */
    const attack = (leader: string, random: number) => {
      const ctx = setup(leader)
      jest.spyOn(Math, 'random').mockReturnValue(random)
      new AttackMonsterAction(
        'a1',
        'p1',
        'monster-1',
        ctx.rm,
        ctx.em,
      ).execute(ctx.gs)
      jest.advanceTimersByTime(5000)
      return ctx
    }

    // 0.7 -> ceil(7.7) + 1 = 9... use a value that lands one short of 9.
    const ONE_SHORT = 7 / 11 - 0.0001 // ceil -> 7, +1 = 8

    it('turns an attack the die alone would miss into a slay', () => {
      const { gs } = attack(ARROW, ONE_SHORT) // 8 + 1 = 9 >= 9
      expect(gs.getParty('p1').getMonsterIds()).toContain('monster-1')
    })

    it('without the leader the same roll misses', () => {
      const { gs } = attack(PLAIN, ONE_SHORT) // 8 < 9
      expect(gs.getParty('p1').getMonsterIds()).not.toContain('monster-1')
      expect(gs.getMonsterPile().getAll()).toContain('monster-1')
    })

    it('the monster card itself still decides the outcome', () => {
      const { gs } = attack(ARROW, LOW) // 1 + 1 = 2 -> fights back, no slay
      expect(makeMonster('monster-1').trySlay(2)).toBe(RollResult.FightBack)
      expect(gs.getParty('p1').getMonsterIds()).not.toContain('monster-1')
    })

    it('does NOT reach a roll on a hero', () => {
      const ctx = setup(ARROW)
      rollOnAHero(ctx, LOW) // baseRoll 1
      expect(openedRoll(ctx.events)['bonuses']).toEqual([])
      expect(openedRoll(ctx.events)['finalRoll']).toBe(2)
    })

    it('does NOT reach a challenge roll', () => {
      const ctx = setup(ARROW)
      ctx.tm.enqueue(new PlayHeroAction('a1', 'p1', 'hero-777', ctx.rm, ctx.em))
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(LOW).mockReturnValueOnce(LOW) // challenger p2 rolls 1
        .mockReturnValueOnce(LOW).mockReturnValueOnce(LOW) // defender p1 rolls 1
        .mockReturnValue(LOW)
      ctx.rm.submitReaction(
        new PlayChallengeReaction('r1', 'p2', CHAL, 'hero-777'),
      )
      jest.advanceTimersByTime(5000)

      expect(payloadsOf(ctx.events, GameEventType.ChallengeResolved)[0]).toMatchObject(
        { challengerFinal: 2, defenderFinal: 2 },
      )
    })
  })

  // =========================================================================
  // The Fist of Reason — the CHALLENGER's roll only
  // =========================================================================

  describe('The Fist of Reason (leader-118)', () => {
    /** p2 challenges a hero p1 played. Both dice land on `random`. */
    const challenge = (p1Leader: string, p2Leader: string) => {
      const ctx = setup(p1Leader, p2Leader)
      ctx.tm.enqueue(new PlayHeroAction('a1', 'p1', 'hero-777', ctx.rm, ctx.em))
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(LOW).mockReturnValueOnce(LOW) // challenger p2 rolls 1
        .mockReturnValueOnce(LOW).mockReturnValueOnce(LOW) // defender p1 rolls 1
        .mockReturnValue(LOW)
      ctx.rm.submitReaction(
        new PlayChallengeReaction('r1', 'p2', CHAL, 'hero-777'),
      )
      jest.advanceTimersByTime(5000)
      return payloadsOf(ctx.events, GameEventType.ChallengeResolved)[0]
    }

    it("boosts the challenger's roll", () => {
      // p2 holds the Fist and is the one challenging.
      expect(challenge(PLAIN, FIST)).toMatchObject({
        challengerFinal: 4, // 1 + 2
        defenderFinal: 2,
        defenderWins: false,
      })
    })

    it('does NOT boost the same player while DEFENDING', () => {
      // p1 holds the Fist and is the one being challenged. "Roll to CHALLENGE"
      // is the active act; defending is not it.
      expect(challenge(FIST, PLAIN)).toMatchObject({
        challengerFinal: 2,
        defenderFinal: 2,
      })
    })

    it('does NOT reach a roll on a hero', () => {
      const ctx = setup(FIST)
      rollOnAHero(ctx, LOW)
      expect(openedRoll(ctx.events)['bonuses']).toEqual([])
    })

    it('does NOT reach an attack roll', () => {
      const ctx = setup(FIST)
      jest.spyOn(Math, 'random').mockReturnValue(7 / 11 - 0.0001) // 8
      new AttackMonsterAction('a1', 'p1', 'monster-1', ctx.rm, ctx.em).execute(
        ctx.gs,
      )
      expect(ctx.gs.getParty('p1').getMonsterIds()).not.toContain('monster-1')
    })
  })

  // =========================================================================
  // The Charismatic Song — HERO EFFECT rolls only
  // =========================================================================

  describe('The Charismatic Song (leader-119)', () => {
    it('is counted when the modifier window OPENS, attributed to the leader', () => {
      const ctx = setup(SONG)
      rollOnAHero(ctx, LOW) // baseRoll 1

      expect(openedRoll(ctx.events)['baseRoll']).toBe(2)
      expect(openedRoll(ctx.events)['finalRoll']).toBe(3)
      expect(openedRoll(ctx.events)['bonuses']).toEqual([
        { cardSource: SONG, amount: 1 },
      ])
    })

    it('turns a roll the die alone would fail into a success', () => {
      const ctx = setup(SONG)
      jest.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0.4)
      rollOnAHero(ctx, 0.2) // ceil 4, +1 = 5 — one short of 6
      const before = ctx.events.length
      jest.advanceTimersByTime(5000)

      expect(
        ctx.events.slice(before).map((e) => e.getType()),
      ).toContain(GameEventType.RollSuccess)
    })

    it('without the leader the same roll fails', () => {
      const ctx = setup(PLAIN)
      jest.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0.4)
      rollOnAHero(ctx, 0.2) // 5 < 6
      const before = ctx.events.length
      jest.advanceTimersByTime(5000)

      expect(
        ctx.events.slice(before).map((e) => e.getType()),
      ).not.toContain(GameEventType.RollSuccess)
      expect(modifierWindow(ctx.gs)).toBeUndefined()
    })

    it('does NOT reach a challenge roll', () => {
      const ctx = setup(SONG)
      ctx.tm.enqueue(new PlayHeroAction('a1', 'p1', 'hero-777', ctx.rm, ctx.em))
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(LOW).mockReturnValueOnce(LOW)
        .mockReturnValueOnce(LOW).mockReturnValueOnce(LOW)
        .mockReturnValue(LOW)
      ctx.rm.submitReaction(
        new PlayChallengeReaction('r1', 'p2', CHAL, 'hero-777'),
      )
      jest.advanceTimersByTime(5000)

      expect(
        payloadsOf(ctx.events, GameEventType.ChallengeResolved)[0],
      ).toMatchObject({ challengerFinal: 2, defenderFinal: 2 })
    })

    it('does NOT reach an attack roll', () => {
      const ctx = setup(SONG)
      jest.spyOn(Math, 'random').mockReturnValue(7 / 11 - 0.0001) // 8
      new AttackMonsterAction('a1', 'p1', 'monster-1', ctx.rm, ctx.em).execute(
        ctx.gs,
      )
      expect(ctx.gs.getParty('p1').getMonsterIds()).not.toContain('monster-1')
    })
  })

  // =========================================================================
  // An UNSCOPED bonus still means every roll
  // =========================================================================

  it('a bonus naming no context reaches a roll the scoped ones do not', () => {
    const { gs, em, rm, tm, events } = setup(PLAIN)
    gs.addEffect({
      id: 'e1',
      sourceCardId: 'hero-028',
      ownerId: 'p1',
      type: PassiveType.RollBonus,
      value: 3,
    })

    tm.enqueue(new PlayHeroAction('a1', 'p1', 'hero-777', rm, em))
    jest.spyOn(Math, 'random').mockReturnValue(LOW)
    jest.advanceTimersByTime(5000)
    jest.advanceTimersByTime(5000)
    tm.enqueue(new RollOnHeroAction('a2', 'p1', 'hero-777', em, rm))

    expect(openedRoll(events)['bonuses']).toEqual([
      { cardSource: 'hero-028', amount: 3 },
    ])
  })
})
