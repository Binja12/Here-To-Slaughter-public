import { CardType, GameEventType, HeroClass, IGameEvent, RefusalReason } from 'shared'
import { ChallengeAbility } from './challenge-ability'
import { abilityRegistry } from './index'
import { GameState } from '../../pipelines/game-state'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { HeroCard } from '../../cards/hero-card'
import { ChallengeCard } from '../../cards/challenge-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { TurnManager } from '../../pipelines/turn-manager'
import { GameEngine } from '../../game-engine'
import { PlayHeroAction } from '../../actions/play-hero-action'
import { PlayChallengeReaction } from '../../reactions/play-challenge-reaction'
import { PlayModifierReaction } from '../../reactions/play-modifier-reaction'
import { ModifierCard } from '../../cards/modifier-card'

// ---------------------------------------------------------------------------
// Challenge (challenge-102 …) — contesting a play, as a registry entry.
//
// The reaction spends the card and announces it; this starts the contest. The
// window still fights and settles it.
//
//   challenge roll = floor(random * 11) + 1  -> 0 => 1, 0.99 => 11
// ---------------------------------------------------------------------------

const CHAL = 'challenge-102'
const HERO = 'hero-777'
const MOD = 'modifier-077'
const MOD_2 = 'modifier-078'

const LOW = 0
const HIGH = 0.99

function setup() {
  const gs = new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

  for (const [playerId, hand] of [
    ['p1', [HERO, MOD]],
    ['p2', [CHAL, MOD_2]],
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
        heroIds: [],
        monsterIds: [],
      }),
    )
  }

  gs.registerCard(
    new HeroCard({
      id: HERO,
      name: HERO,
      type: CardType.Hero,
      image: '',
      description: '',
      set: 'base',
      heroClass: HeroClass.Fighter,
      rollReq: 6,
    }),
  )
  for (const id of [MOD, MOD_2]) {
    gs.registerCard(
      new ModifierCard({
        id,
        name: 'Modifier',
        type: CardType.Modifier,
        image: '',
        description: '',
        set: 'base',
        values: [3, -3],
      }),
    )
  }
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

  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  const tm = new TurnManager(gs, em)
  new TaskManager(gs, em, rm, abilityRegistry)
  const engine = new GameEngine(gs, tm, em, [])
  engine.start(['p1', 'p2'])

  return { gs, em, rm, tm, events }
}

const typesOf = (events: IGameEvent[]) => events.map((e) => e.getType())

const payloadsOf = (events: IGameEvent[], type: GameEventType) =>
  events
    .filter((e) => e.getType() === type)
    .map((e) => e.getPayload() as Record<string, unknown>)

/** p1 plays a hero; p2 challenges it. Dice are mocked by the caller first. */
function challengeThePlay(ctx: ReturnType<typeof setup>) {
  ctx.tm.enqueue(new PlayHeroAction('a1', 'p1', HERO, ctx.rm, ctx.em))
  ctx.rm.submitReaction(new PlayChallengeReaction('r1', 'p2', CHAL, HERO))
}

describe('ChallengeAbility', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('is registered against every printed copy', () => {
    expect(abilityRegistry.get('challenge-102')).toBe(ChallengeAbility)
    expect(abilityRegistry.get('challenge-115')).toBe(ChallengeAbility)
    const ids = [...abilityRegistry.entries()]
      .filter(([, ability]) => ability === ChallengeAbility)
      .map(([id]) => id)
    expect(ids).toHaveLength(14)
  })

  it('is ONE entry, on the card being played', () => {
    expect(ChallengeAbility).toHaveLength(1)
    expect(ChallengeAbility[0].trigger.on).toBe(GameEventType.ChallengePlayed)
  })

  it('the card being spent is what starts the contest', () => {
    const ctx = setup()
    jest.spyOn(Math, 'random').mockReturnValue(LOW)
    challengeThePlay(ctx)

    // Announced by the reaction, acted on by the card's own entry.
    const order = typesOf(ctx.events).filter(
      (t) =>
        t === GameEventType.ChallengePlayed ||
        t === GameEventType.ChallengeStarted,
    )
    expect(order).toEqual([
      GameEventType.ChallengePlayed,
      GameEventType.ChallengeStarted,
    ])
  })

  it('names the challenger as the player who spent the card', () => {
    const ctx = setup()
    jest.spyOn(Math, 'random').mockReturnValue(LOW)
    challengeThePlay(ctx)

    expect(payloadsOf(ctx.events, GameEventType.ChallengeStarted)[0]).toMatchObject(
      { challengerId: 'p2', defenderId: 'p1', cardId: HERO },
    )
  })

  describe('the instance zone', () => {
    it('the card is on the table while the contest runs', () => {
      const ctx = setup()
      jest.spyOn(Math, 'random').mockReturnValue(LOW)
      challengeThePlay(ctx)

      expect(ctx.gs.getParty('p2').getInstanceCardIds()).toContain(CHAL)
      expect(ctx.gs.getDiscardPile().getAll()).not.toContain(CHAL)
    })

    it('is discarded when the DEFENDER wins and the frame is released', () => {
      const ctx = setup()
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(LOW) // challenger p2 rolls 1
        .mockReturnValueOnce(HIGH) // defender p1 rolls 11
        .mockReturnValue(HIGH)
      challengeThePlay(ctx)
      jest.advanceTimersByTime(5000)

      expect(ctx.gs.getParty('p1').getHeroIds()).toContain(HERO)
      expect(ctx.gs.getParty('p2').getInstanceCardIds()).not.toContain(CHAL)
      expect(ctx.gs.getDiscardPile().getAll()).toContain(CHAL)
    })

    it('is discarded when the CHALLENGER wins and the frame rolls back', () => {
      const ctx = setup()
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(HIGH) // challenger p2 rolls 11
        .mockReturnValueOnce(LOW) // defender p1 rolls 1
        .mockReturnValue(LOW)
      challengeThePlay(ctx)
      jest.advanceTimersByTime(5000)

      expect(ctx.gs.getParty('p1').getHeroIds()).not.toContain(HERO)
      expect(ctx.gs.getParty('p2').getInstanceCardIds()).not.toContain(CHAL)
      // Both cards end up there: the hero by the window, the challenge card by
      // restoreFrame, from the list the frame kept of what was spent into it.
      expect(ctx.gs.getDiscardPile().getAll()).toEqual(
        expect.arrayContaining([CHAL, HERO]),
      )
    })

    it('never returns to the hand', () => {
      const ctx = setup()
      jest.spyOn(Math, 'random').mockReturnValue(HIGH)
      challengeThePlay(ctx)
      jest.advanceTimersByTime(5000)

      expect(ctx.gs.getPlayer('p2')!.getHand()).not.toContain(CHAL)
    })
  })

  it('an unchallenged play settles with no ChallengeStarted at all', () => {
    const ctx = setup()
    jest.spyOn(Math, 'random').mockReturnValue(HIGH)
    ctx.tm.enqueue(new PlayHeroAction('a1', 'p1', HERO, ctx.rm, ctx.em))
    jest.advanceTimersByTime(5000)

    expect(typesOf(ctx.events)).not.toContain(GameEventType.ChallengeStarted)
    expect(ctx.gs.getParty('p1').getHeroIds()).toContain(HERO)
    expect(ctx.gs.getPlayer('p2')!.getHand()).toContain(CHAL)
  })

  it('a second challenge on the same card is refused', () => {
    const ctx = setup()
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(LOW)
      .mockReturnValueOnce(HIGH)
      .mockReturnValue(HIGH)
    challengeThePlay(ctx)
    jest.advanceTimersByTime(5000)

    // Survived, so it is marked; canExecute refuses before the card is spent.
    expect(ctx.gs.getCardsChallengedThisTurn()).toContain(HERO)
    expect(
      new PlayChallengeReaction('r2', 'p2', CHAL, HERO).canExecute(ctx.gs),
    ).toEqual({ accepted: false, reason: RefusalReason.AlreadyChallengedThisTurn })
  })
})

// ---------------------------------------------------------------------------
// A modifier INSIDE a challenge lands on the side it was aimed at
//
// The value comes with the play; which of the two rolls it lands on is the
// target the player named, challenger or defender.
// ---------------------------------------------------------------------------

describe('a modifier inside a challenge', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  /** A live challenge (p2 contests p1's hero), both dice on 1. */
  function contested() {
    const ctx = setup()
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(LOW) // challenger p2 rolls 1
      .mockReturnValueOnce(LOW) // defender p1 rolls 1
      .mockReturnValue(LOW)
    challengeThePlay(ctx)
    return ctx
  }

  const appliedValues = (ctx: ReturnType<typeof setup>) =>
    payloadsOf(ctx.events, GameEventType.ModifierApplied).map((p) => p['value'])

  it('aimed at the DEFENDER lands the value named on the defender', () => {
    const ctx = contested()
    ctx.rm.submitReaction(
      new PlayModifierReaction('r2', 'p2', MOD_2, 'p1', -3),
    )

    expect(appliedValues(ctx)).toEqual([-3])
  })

  it('aimed at the CHALLENGER lands the value named on the challenger', () => {
    const ctx = contested()
    ctx.rm.submitReaction(new PlayModifierReaction('r2', 'p2', MOD_2, 'p2', 3))

    expect(appliedValues(ctx)).toEqual([3])
  })
})
