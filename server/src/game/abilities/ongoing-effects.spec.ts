import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  PassiveType,
  TriggerScope,
} from 'shared'
import { GameState } from '../pipelines/game-state'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { HeroCard } from '../cards/hero-card'
import { GameEvent } from '../events/game-event'
import { GameEventEmitter } from '../events/game-event-emitter'
import { TaskManager } from '../pipelines/task-manager'
import { ReactionManager } from '../pipelines/reaction-manager'
import { AbilityContext, CTX_CHOSEN_CARD } from './ability-context'
import { IEffect, IAbilityRule } from '../interfaces'
import { ApplyEffectTask } from '../tasks/tasks'
import { StealFromPartyTask } from '../tasks/hero-tasks'
import {
  untilEndOfTurn,
  untilOwnersNextTurn,
  untilSourceLeavesParty,
  whileClassInParty,
} from './expiries'

// ---------------------------------------------------------------------------
// Ongoing effects — the lifetime an ability's `trigger` cannot express.
//
// Trigger and expiry are symmetric: both are game events. An effect with no
// expiry is permanent (monster passives — a slain monster never leaves play).
// `shouldExpire` is the optional state check that runs when the expiry event
// fires: the event says WHEN to look, the check says WHETHER it is over.
// ---------------------------------------------------------------------------

const makeGs = () =>
  new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

const hero = (id: string, heroClass = HeroClass.Fighter) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'test',
    heroClass,
    rollReq: 5,
  })

function seat(gs: GameState, playerId: string, heroIds: string[] = []): void {
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
      heroIds,
      monsterIds: [],
    }),
  )
}

function setup(abilities: Map<string, IAbilityRule[]> = new Map()) {
  const gs = makeGs()
  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  new TaskManager(gs, em, rm, abilities)
  return { gs, em, rm, events }
}

/** A CantBeStolen effect on p1. No expiry = permanent, unless overridden. */
const anEffect = (over: Partial<IEffect> = {}): IEffect => ({
  id: 'effect-1',
  sourceCardId: 'source-card',
  ownerId: 'p1',
  type: PassiveType.CantBeStolen,
  ...over,
})

/** "...while you have a Ranger" — the shared wording from expiries.ts. */
const whileRangerInParty = whileClassInParty(HeroClass.Ranger)

const turnStarted = (playerId: string) =>
  new GameEvent(GameEventType.TurnStarted, playerId, { playerId })
const turnEnded = (playerId: string) =>
  new GameEvent(GameEventType.TurnEnded, playerId, { playerId })

const isProtected = (gs: GameState, playerId = 'p1') =>
  gs.hasEffect(PassiveType.CantBeStolen, playerId)

/** Effects live on their owner, so assertions read them from the player. */
const effectsOf = (gs: GameState, playerId: string) =>
  gs.getPlayer(playerId)!.getAllEffects()

describe('ongoing effects', () => {
  // -------------------------------------------------------------------------
  // ApplyEffectTask — the step that installs one
  // -------------------------------------------------------------------------

  describe('ApplyEffectTask', () => {
    it('takes owner and source from the context, not the declaration', () => {
      const { gs, em, rm } = setup()
      seat(gs, 'p2')

      new ApplyEffectTask({
        type: PassiveType.CantBeStolen,
        expiry: untilOwnersNextTurn,
      }).execute(gs, new AbilityContext('leader-card', 'p2'), em, rm)

      expect(effectsOf(gs, 'p2')).toHaveLength(1)
      expect(effectsOf(gs, 'p2')[0].ownerId).toBe('p2')
      expect(effectsOf(gs, 'p2')[0].sourceCardId).toBe('leader-card')
      expect(isProtected(gs, 'p2')).toBe(true)
    })

    it('announces the effect so a client can render state no card face shows', () => {
      const { gs, em, rm, events } = setup()
      seat(gs, 'p1')

      new ApplyEffectTask({
        type: PassiveType.CantBeStolen,
        expiry: untilOwnersNextTurn,
      }).execute(gs, new AbilityContext('source-card', 'p1'), em, rm)

      const applied = events.find(
        (e) => e.getType() === GameEventType.EffectApplied,
      )
      expect(applied).toBeDefined()
      expect(applied!.getPayload()).toMatchObject({
        sourceCardId: 'source-card',
        passive: PassiveType.CantBeStolen,
        // Event types only — shouldExpire is server code, not payload data.
        expiresOn: [GameEventType.TurnStarted],
      })
    })

    it('normalises a single expiry into the array the sweep walks', () => {
      const { gs, em, rm } = setup()
      seat(gs, 'p1')

      new ApplyEffectTask({
        type: PassiveType.CantBeStolen,
        expiry: untilEndOfTurn,
      }).execute(gs, new AbilityContext('source-card', 'p1'), em, rm)

      expect(effectsOf(gs, 'p1')[0].expiry).toEqual([untilEndOfTurn])
    })
  })

  // -------------------------------------------------------------------------
  // Turn-boundary expiries — the reusable wordings from expiries.ts
  // -------------------------------------------------------------------------

  describe('turn-boundary expiry', () => {
    it('"until your next turn begins" ignores everyone else\'s turn starting', () => {
      const { gs, em } = setup()
      seat(gs, 'p1')
      seat(gs, 'p2')
      gs.addEffect(anEffect({ expiry: [untilOwnersNextTurn] }))

      em.emit(turnStarted('p2'))

      expect(isProtected(gs)).toBe(true)
    })

    it('"until your next turn begins" ends when the owner\'s turn starts', () => {
      const { gs, em, events } = setup()
      seat(gs, 'p1')
      gs.addEffect(anEffect({ expiry: [untilOwnersNextTurn] }))

      em.emit(turnStarted('p1'))

      expect(isProtected(gs)).toBe(false)
      expect(
        events.some((e) => e.getType() === GameEventType.EffectExpired),
      ).toBe(true)
    })

    it('"until end of turn" ends with the turn in progress', () => {
      const { gs, em } = setup()
      seat(gs, 'p1')
      gs.addEffect(anEffect({ expiry: [untilEndOfTurn] }))

      em.emit(turnEnded('p1'))

      expect(isProtected(gs)).toBe(false)
    })

    it('no expiry = permanent — survives every boundary', () => {
      const { gs, em } = setup()
      seat(gs, 'p1')
      gs.addEffect(anEffect())

      em.emit(turnEnded('p1'))
      em.emit(turnStarted('p1'))

      expect(isProtected(gs)).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Event + shouldExpire — the case a bare event cannot decide
  // -------------------------------------------------------------------------

  describe('shouldExpire confirmation', () => {
    it('losing one of two Rangers does NOT end a "while you have a Ranger" effect', () => {
      const { gs, em } = setup()
      seat(gs, 'p1', ['ranger-1', 'ranger-2'])
      gs.registerCard(hero('ranger-1', HeroClass.Ranger))
      gs.registerCard(hero('ranger-2', HeroClass.Ranger))
      gs.addEffect(anEffect({ expiry: [whileRangerInParty] }))

      gs.getParty('p1').removeHero('ranger-1', em, 'Destroyed')

      // The expiry event fired, but the state check said "still true".
      expect(isProtected(gs)).toBe(true)
    })

    it('losing the LAST Ranger ends it — on the removal event itself', () => {
      const { gs, em } = setup()
      seat(gs, 'p1', ['ranger-1'])
      gs.registerCard(hero('ranger-1', HeroClass.Ranger))
      gs.addEffect(anEffect({ expiry: [whileRangerInParty] }))

      gs.getParty('p1').removeHero('ranger-1', em, 'Stolen')

      expect(isProtected(gs)).toBe(false)
    })

    // There used to be a test here proving that a raw party mutation was invisi...

    it('untilSourceLeavesParty ends when the installing card itself is removed', () => {
      const { gs, em } = setup()
      seat(gs, 'p1', ['source-card', 'bystander'])
      gs.registerCard(hero('source-card'))
      gs.registerCard(hero('bystander'))
      gs.addEffect(anEffect({ expiry: [untilSourceLeavesParty] }))

      gs.getParty('p1').removeHero('bystander', em, 'Destroyed')
      expect(isProtected(gs)).toBe(true) // someone else left — not the source

      gs.getParty('p1').removeHero('source-card', em, 'Destroyed')
      expect(isProtected(gs)).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // A live effect is a temporary passive ability
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Rule consumers — a passive flag is only real if something reads it
  // -------------------------------------------------------------------------

  describe('rule consumers', () => {
    /** p1 tries to steal p2's hero. */
    function stealSetup() {
      const ctx = new AbilityContext('thief-card', 'p1')
      const { gs, em, rm } = setup()
      seat(gs, 'p1')
      seat(gs, 'p2', ['victim'])
      gs.registerCard(hero('victim'))
      ctx.set(CTX_CHOSEN_CARD, ['victim'])
      return { gs, em, rm, ctx }
    }

    it('steals when the target is unprotected', () => {
      const { gs, em, rm, ctx } = stealSetup()

      new StealFromPartyTask().execute(gs, ctx, em, rm)

      expect(gs.getParty('p1').getHeroIds()).toContain('victim')
      expect(gs.getParty('p2').getHeroIds()).not.toContain('victim')
    })

    it('a successful steal announces the canonical removal event', () => {
      const { gs, em, rm, ctx } = stealSetup()
      const events: IGameEvent[] = []
      em.addListener({ onEvent: (e) => events.push(e) })

      new StealFromPartyTask().execute(gs, ctx, em, rm)

      const removed = events.find(
        (e) => e.getType() === GameEventType.HeroRemovedFromParty,
      )
      expect(removed).toBeDefined()
      expect(removed!.getPayload()).toMatchObject({
        cardId: 'victim',
        playerId: 'p2',
        reason: 'Stolen',
      })
    })

    it("CantBeStolen on the target's owner blocks the steal", () => {
      const { gs, em, rm, ctx } = stealSetup()
      gs.addEffect(anEffect({ ownerId: 'p2' }))

      new StealFromPartyTask().execute(gs, ctx, em, rm)

      expect(gs.getParty('p2').getHeroIds()).toContain('victim')
      expect(gs.getParty('p1').getHeroIds()).not.toContain('victim')
    })

    it("the thief's own protection does not stop them stealing", () => {
      const { gs, em, rm, ctx } = stealSetup()
      gs.addEffect(anEffect({ ownerId: 'p1' }))

      new StealFromPartyTask().execute(gs, ctx, em, rm)

      expect(gs.getParty('p1').getHeroIds()).toContain('victim')
    })

  })

  // -------------------------------------------------------------------------
  // Frames — effects are plain data, so rollback covers them for free
  // -------------------------------------------------------------------------

  describe('frames', () => {
    it('discards an effect installed after the snapshot when the frame rolls back', () => {
      const { gs, rm } = setup()
      seat(gs, 'p1')

      const frameId = rm.openFrame()
      gs.addEffect(anEffect())
      expect(isProtected(gs)).toBe(true)

      gs.restoreFrame(frameId)

      expect(isProtected(gs)).toBe(false)
    })

    it('keeps an effect that predates the snapshot', () => {
      const { gs, rm } = setup()
      seat(gs, 'p1')

      gs.addEffect(anEffect())
      const frameId = rm.openFrame()
      gs.restoreFrame(frameId)

      expect(isProtected(gs)).toBe(true)
    })

    it('brings back an effect the sweep removed after the snapshot', () => {
      // The case that proves Player.clone() isolates the list: the snapshot and t...
      const { gs, em, rm } = setup()
      seat(gs, 'p1')
      gs.addEffect(anEffect({ expiry: [untilEndOfTurn] }))

      const frameId = rm.openFrame() // snapshot still holds the effect
      em.emit(turnEnded('p1')) // sweep drops it from the live player
      expect(isProtected(gs)).toBe(false)

      gs.restoreFrame(frameId)

      expect(isProtected(gs)).toBe(true)
    })
  })
})
