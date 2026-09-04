import { ActionType, CardType, GameEventType, HeroClass, IGameEvent, ReactionWindowType, RefusalReason, RollCompareMode, TriggerScope } from 'shared'
import { AttackMonsterAction } from './attack-monster-action'
import { GameState } from '../pipelines/game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { ReactionManager } from '../pipelines/reaction-manager'
import { MonsterCard } from '../cards/monster-card'
import { HeroCard } from '../cards/hero-card'
import { PartyLeaderCard } from '../cards/party-leader-card'
import { TaskManager } from '../pipelines/task-manager'
import { ITask } from '../interfaces'

// --- Helpers ---

const makePlayer = (id: string, ap = 3) =>
  new Player({ id, name: `Player ${id}`, hand: [], partyId: `party-${id}`, actionPoints: ap })

const makeParty = (playerId: string) =>
  new Party({ playerId, leaderId: `leader-${playerId}`, heroIds: [], monsterIds: [] })

/**
 * HighToWin defaults: higherReq=8, lowerReq=3
 *   roll >= 8  → Slay       (mock Math.random to 0.99 → roll 12)
 *   roll <= 3  → FightBack  (mock Math.random to 0    → roll 1)
 *   4–7        → Miss       (mock Math.random to 0.3  → roll 5)
 */
const makeMonsterCard = (id: string, higherReq = 8, lowerReq = 3) =>
  new MonsterCard({
    id,
    name: `Monster ${id}`,
    type: CardType.Monster,
    image: '',
    description: '',
    set: '',
    lowerReq,
    higherReq,
    rollCompareMode: RollCompareMode.HighToWin,
    partyReq: { classes: [] },
  })

const makeGs = () => {
  const deck = new CardStack('deck-1', 'main-deck')
  const discard = new CardPile('discard-1', 'discard-pile')
  const monsterDeck = new CardStack('mdeck-1', 'monster-deck')
  const monsterPile = new CardPile('mpile-1', 'monster-pile')
  return new GameState(deck, discard, monsterDeck, monsterPile)
}

// --- Tests ---

describe('AttackMonsterAction', () => {
  let emitter: GameEventEmitter
  let emitted: IGameEvent[]
  let gs: GameState
  let player: Player
  let party: Party

  beforeEach(() => {
    jest.useFakeTimers()
    emitter = new GameEventEmitter()
    emitted = []
    emitter.addListener({ onEvent: (e) => emitted.push(e) })
    gs = makeGs()
    player = makePlayer('p1', 3)
    party = makeParty('p1')
    gs.registerPlayer(player)
    gs.registerParty(party)
    gs.setCurrentPlayerId('p1')
    gs.registerCard(makeMonsterCard('monster-1'))
    gs.getMonsterPile().add('monster-1')
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  const makeAction = () => {
    const rm = new ReactionManager(gs, emitter)
    return new AttackMonsterAction('a1', 'p1', 'monster-1', rm, emitter)
  }

  /** Nobody spends a modifier, so the window lapses and settles the attack. */
  const settle = () => jest.advanceTimersByTime(5000)

  const types = () => emitted.map((e) => e.getType())

  // --- Metadata ---

  describe('metadata', () => {
    it('getId returns the action id', () => {
      expect(makeAction().getId()).toBe('a1')
    })

    it('getType returns ActionType.AttackMonster', () => {
      expect(makeAction().getType()).toBe(ActionType.AttackMonster)
    })

    it('getPlayerId returns the player id', () => {
      expect(makeAction().getPlayerId()).toBe('p1')
    })

    it('getCost returns 2', () => {
      expect(makeAction().getCost()).toBe(2)
    })
  })

  // --- canExecute ---

  describe('canExecute', () => {
    it('throws when the player is not seated — an engine mistake, not a refusal', () => {
      const emptyGs = makeGs()
      emptyGs.setCurrentPlayerId('p1')
      emptyGs.getMonsterPile().add('monster-1')
      const rm = new ReactionManager(emptyGs, emitter)
      const action = new AttackMonsterAction('a1', 'p1', 'monster-1', rm, emitter)
      expect(() => action.canExecute(emptyGs)).toThrow(/not seated/)
    })

    it('returns false when player has exactly 1 action point (cost is 2)', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', 1))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      gs2.registerCard(makeMonsterCard('monster-1'))
      gs2.getMonsterPile().add('monster-1')
      const rm = new ReactionManager(gs2, emitter)
      const action = new AttackMonsterAction('a1', 'p1', 'monster-1', rm, emitter)
      expect(action.canExecute(gs2)).toEqual({ accepted: false, reason: RefusalReason.NoActionPoints })
    })

    it('returns false when the monster is not in the monster pile', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', 3))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      gs2.registerCard(makeMonsterCard('monster-1'))
      // deliberately not adding monster-1 to the pile
      const rm = new ReactionManager(gs2, emitter)
      const action = new AttackMonsterAction('a1', 'p1', 'monster-1', rm, emitter)
      expect(action.canExecute(gs2)).toEqual({ accepted: false, reason: RefusalReason.MonsterNotInRow })
    })

    it('returns true when all conditions are met', () => {
      expect(makeAction().canExecute(gs)).toEqual({ accepted: true })
    })

    // --- the monster's printed party requirement ---

    describe("the monster's partyReq", () => {
      /** The Dark Dragon King's shape: a Bard plus one more hero. */
      const kingGs = (partyClasses: HeroClass[]) => {
        const g = makeGs()
        g.registerPlayer(makePlayer('p1', 3))
        g.registerParty(makeParty('p1'))
        g.setCurrentPlayerId('p1')
        g.registerCard(
          new MonsterCard({
            id: 'monster-1',
            name: 'Dark Dragon King',
            type: CardType.Monster,
            image: '',
            description: '',
            set: '',
            lowerReq: 4,
            higherReq: 8,
            rollCompareMode: RollCompareMode.HighToWin,
            partyReq: { classes: [HeroClass.Bard, 'Any'] },
          }),
        )
        g.getMonsterPile().add('monster-1')
        partyClasses.forEach((cls, i) => {
          g.registerCard(
            new HeroCard({
              id: `hero-${i}`,
              name: `hero-${i}`,
              type: CardType.Hero,
              image: '',
              description: '',
              set: '',
              heroClass: cls,
              rollReq: 5,
            }),
          )
          g.getParty('p1').addHero(`hero-${i}`, emitter, 'Played')
        })
        return g
      }

      const canAttack = (g: GameState) =>
        new AttackMonsterAction(
          'a1',
          'p1',
          'monster-1',
          new ReactionManager(g, emitter),
          emitter,
        ).canExecute(g)

      it('refuses an empty party', () => {
        expect(canAttack(kingGs([]))).toEqual({ accepted: false, reason: RefusalReason.PartyRequirementUnmet })
      })

      it('refuses a lone Bard — Any needs a SECOND hero', () => {
        expect(canAttack(kingGs([HeroClass.Bard]))).toEqual({ accepted: false, reason: RefusalReason.PartyRequirementUnmet })
      })

      it('refuses two heroes when neither is a Bard', () => {
        expect(canAttack(kingGs([HeroClass.Thief, HeroClass.Wizard]))).toEqual({ accepted: false, reason: RefusalReason.PartyRequirementUnmet })
      })

      it('allows a Bard and any other class', () => {
        expect(canAttack(kingGs([HeroClass.Bard, HeroClass.Thief]))).toEqual({ accepted: true })
      })

      it('allows two Bards — one answers Bard, the other answers Any', () => {
        expect(canAttack(kingGs([HeroClass.Bard, HeroClass.Bard]))).toEqual({ accepted: true })
      })

      it('goes false again when the Bard is stolen away', () => {
        const g = kingGs([HeroClass.Bard, HeroClass.Thief])
        expect(canAttack(g)).toEqual({ accepted: true })

        g.getParty('p1').removeHero('hero-0', emitter, 'Stolen')

        expect(canAttack(g)).toEqual({ accepted: false, reason: RefusalReason.PartyRequirementUnmet })
      })

      /**
       * The leader is NOT one of the heroes a monster asks for (the owner,
       * 2026-09-04). Arctic Aries (monster-121) asks for one hero of any
       * class and was attackable off a bare leader while the requirement
       * read the leader's class too.
       */
      it('does not answer a partyReq with the LEADER — a bare party attacks nothing', () => {
        const g = kingGs([])
        g.registerCard(
          new PartyLeaderCard({
            id: 'leader-p1',
            name: 'The Charmed Bard',
            type: CardType.Leader,
            image: '',
            description: '',
            set: '',
            heroClass: HeroClass.Bard,
          }),
        )

        expect(canAttack(g)).toEqual({
          accepted: false,
          reason: RefusalReason.PartyRequirementUnmet,
        })
      })

      it("still refuses when the leader's class is the one hero missing", () => {
        const g = kingGs([HeroClass.Thief])
        g.registerCard(
          new PartyLeaderCard({
            id: 'leader-p1',
            name: 'The Charmed Bard',
            type: CardType.Leader,
            image: '',
            description: '',
            set: '',
            heroClass: HeroClass.Bard,
          }),
        )

        expect(canAttack(g)).toEqual({
          accepted: false,
          reason: RefusalReason.PartyRequirementUnmet,
        })
      })
    })
  })

  // --- execute ---

  describe('execute', () => {
    it('always decreases player action points by 2', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.3) // Miss
      makeAction().execute(gs)
      expect(player.getActionPoints()).toBe(1)
    })

    it('spends the points before the frame opens, so a miss still costs them', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.3)
      makeAction().execute(gs)
      settle()
      expect(player.getActionPoints()).toBe(1)
    })

    it('announces the raw die, then opens an attack window naming the monster', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.99) // baseRoll 12

      makeAction().execute(gs)

      expect(types()).toEqual([
        GameEventType.DiceRolled,
        GameEventType.ReactionWindowOpened,
      ])
      expect(emitted[0].getPayload()).toMatchObject({
        cardId: 'monster-1',
        baseRoll: 12,
      })
      expect(emitted[1].getPayload()).toMatchObject({
        windowType: ReactionWindowType.Attack,
        monsterId: 'monster-1',
        baseRoll: 12,
        finalRoll: 12,
        rollerId: 'p1',
      })
    })

    it('leaves the outcome to the window — nothing has moved yet', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.99) // a Slay, once settled
      makeAction().execute(gs)

      expect(gs.getMonsterPile().getAll()).toContain('monster-1')
      expect(party.getMonsterIds()).not.toContain('monster-1')
      expect(gs.hasOpenFrames()).toBe(true)
    })

    it('drops the frameId — an action has no pipeline to suspend', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.99)
      expect(makeAction().execute(gs)).toBeUndefined()
    })

    describe('on a Slay roll (mock random 0.99 → roll 12 ≥ higherReq 8)', () => {
      beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0.99))

      it('removes the monster from the monster pile', () => {
        makeAction().execute(gs)
        settle()
        expect(gs.getMonsterPile().getAll()).not.toContain('monster-1')
      })

      it('adds the monster to the player party', () => {
        makeAction().execute(gs)
        settle()
        expect(party.getMonsterIds()).toContain('monster-1')
      })

      it('emits MonsterSlain, and no fight-back', () => {
        makeAction().execute(gs)
        settle()
        expect(types()).toContain(GameEventType.MonsterSlain)
        expect(types()).not.toContain(GameEventType.MonsterFoughtBack)
      })
    })

    describe('on a Miss roll (mock random 0.3 → roll 5, between the two bands)', () => {
      beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0.3))

      it('does not remove the monster from the pile', () => {
        makeAction().execute(gs)
        settle()
        expect(gs.getMonsterPile().getAll()).toContain('monster-1')
      })

      it('does not add the monster to the party', () => {
        makeAction().execute(gs)
        settle()
        expect(party.getMonsterIds()).not.toContain('monster-1')
      })

      it('announces neither outcome — a miss is the window closing and nothing else', () => {
        makeAction().execute(gs)
        settle()
        expect(types()).not.toContain(GameEventType.MonsterSlain)
        expect(types()).not.toContain(GameEventType.MonsterFoughtBack)
      })
    })

    describe('on a FightBack roll (mock random 0 → roll 1 ≤ lowerReq 3)', () => {
      beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0))

      it('does not remove the monster from the pile', () => {
        makeAction().execute(gs)
        settle()
        expect(gs.getMonsterPile().getAll()).toContain('monster-1')
      })

      it('does not add the monster to the party', () => {
        makeAction().execute(gs)
        settle()
        expect(party.getMonsterIds()).not.toContain('monster-1')
      })

      it('emits MonsterFoughtBack naming the monster and the attacker', () => {
        makeAction().execute(gs)
        settle()
        const foughtBack = emitted.find(
          (e) => e.getType() === GameEventType.MonsterFoughtBack,
        )
        expect(foughtBack!.getPayload()).toMatchObject({ cardId: 'monster-1' })
        expect(foughtBack!.getPlayerId()).toBe('p1')
      })
    })
  })
})

// ---------------------------------------------------------------------------
// The whole cycle: a failed attack running the monster's own steps.
//
// A monster in the pile belongs to nobody, so its entry is scoped Attacker and
// the run is owned by whoever swung at it. Nothing here is a hand-made event —
// the action rolls, the window settles, and the announcement does the rest.
// ---------------------------------------------------------------------------

describe('AttackMonsterAction — the monster answers back', () => {
  const FIGHT_BACK = 0 // baseRoll 1, at or under lowerReq 3
  const SLAY = 0.99 // baseRoll 12, at or over higherReq 8
  const MISS = 0.3 // baseRoll 5, between the two

  const armed = (steps: ITask[]) => {
    const gs = makeGs()
    const emitter = new GameEventEmitter()
    const emitted: IGameEvent[] = []
    emitter.addListener({ onEvent: (e) => emitted.push(e) })

    gs.registerPlayer(makePlayer('p1', 3))
    gs.registerParty(makeParty('p1'))
    gs.setCurrentPlayerId('p1')
    gs.registerCard(makeMonsterCard('monster-1'))
    gs.getMonsterPile().add('monster-1')

    const rm = new ReactionManager(gs, emitter)
    new TaskManager(
      gs,
      emitter,
      rm,
      new Map([
        [
          'monster-1',
          [
            {
              trigger: {
                on: GameEventType.MonsterFoughtBack,
                scope: TriggerScope.Attacker,
              },
              steps,
            },
          ],
        ],
      ]),
    )
    return { gs, emitter, emitted, rm }
  }

  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  const attack = (steps: ITask[], random: number) => {
    const ctx = armed(steps)
    jest.spyOn(Math, 'random').mockReturnValue(random)
    new AttackMonsterAction('a1', 'p1', 'monster-1', ctx.rm, ctx.emitter).execute(
      ctx.gs,
    )
    jest.advanceTimersByTime(5000)
    return ctx
  }

  it('runs the monster steps, owned by the attacker', () => {
    const ranFor: string[] = []
    attack([{ execute: (_gs, c) => void ranFor.push(c.ownerId) }], FIGHT_BACK)
    expect(ranFor).toEqual(['p1'])
  })

  it('sources those steps to the monster, though it is in nobody party', () => {
    const sources: string[] = []
    attack(
      [{ execute: (_gs, c) => void sources.push(c.sourceCardId) }],
      FIGHT_BACK,
    )
    expect(sources).toEqual(['monster-1'])
  })

  it('a MISS runs nothing — only the fight-back band answers', () => {
    const ranFor: string[] = []
    attack([{ execute: (_gs, c) => void ranFor.push(c.ownerId) }], MISS)
    expect(ranFor).toHaveLength(0)
  })

  it('a SLAY runs nothing — the monster is won, not roused', () => {
    const ranFor: string[] = []
    const { gs } = attack(
      [{ execute: (_gs, c) => void ranFor.push(c.ownerId) }],
      SLAY,
    )
    expect(ranFor).toHaveLength(0)
    expect(gs.getParty('p1').getMonsterIds()).toContain('monster-1')
  })

  it('what the steps do survives the rollback — the frame is already closed', () => {
    const { gs } = attack(
      [{ execute: (g) => void g.getPlayer('p1')!.decreaseActionPoints(1) }],
      FIGHT_BACK,
    )
    // 3 - 2 for the attack - 1 the monster took back.
    expect(gs.getPlayer('p1')!.getActionPoints()).toBe(0)
  })
})
