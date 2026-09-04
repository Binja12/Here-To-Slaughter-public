import { CardType, GameEventType, HeroClass, IGameEvent, Owner, ReactionWindowType, TriggerScope, TurnPhase, Zone } from 'shared'
import { heroRules, OFFERS_ROLL } from './hero-rules'
import { WigglesAbility } from './wiggles-ability'
import { GameState } from '../../pipelines/game-state'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { HeroCard } from '../../cards/hero-card'
import { ChallengeCard } from '../../cards/challenge-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { GameEvent } from '../../events/game-event'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { TurnManager } from '../../pipelines/turn-manager'
import { GameEngine } from '../../game-engine'
import { PlayHeroAction } from '../../actions/play-hero-action'
import { PlayHeroTask } from '../../tasks/play-hero-task'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { PlayChallengeReaction } from '../../reactions/play-challenge-reaction'

import { ChallengeAbility } from './challenge-ability'

/** A real printed id: contesting a play is the challenge card's own entry. */
const CHAL = 'challenge-102'
import { CONFIRM } from '../../reactions/task-choice-window'
import { IAbilityRule, IReactionWindow } from '../../interfaces'

// ---------------------------------------------------------------------------
// The roll a played hero is offered — both ways a hero reaches the table.
//
//   PlayHeroAction | PlayHeroTask
//     -> challenge window -> settles
//     -> "do you want to roll?" -> yes
//     -> RollOnHeroTask -> modifier window -> settles
//     -> the hero's own ability
//
// Wiggles is the hero throughout, so the last step is visible: a successful
// roll starts its steal, and nothing else in the engine would.
//
//   baseRoll       = ceil(random * 11) + 1   -> 0 => 1, 0.99 => 12
//   challenge roll = floor(random * 11) + 1  -> 0 => 1, 0.99 => 11
//   the test heroes need 5.
// ---------------------------------------------------------------------------

const LOW = 0
const HIGH = 0.99

/** Plays whatever hero is in hand — the ability half of getting one into play. */
const DRIVER = 'p1-leader'
const DriverAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.TurnStarted, scope: TriggerScope.OwnerEvent },
    steps: [
      new ChooseCardTask({
        zone: Zone.Hand,
        owner: Owner.Self,
        cardType: CardType.Hero,
      }),
      new PlayHeroTask(),
    ],
  },
]

const makeGs = () =>
  new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

const makeHero = (id: string) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'test',
    heroClass: HeroClass.Fighter,
    rollReq: 5,
  })

function seat(
  gs: GameState,
  playerId: string,
  hand: string[] = [],
  heroIds: string[] = [],
) {
  gs.registerPlayer(
    new Player({
      id: playerId,
      name: playerId,
      hand,
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

/** p1 holds Wiggles; p2 fields a stealable hero and a challenge card. */
function setup(withDriver = false) {
  const gs = makeGs()
  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })

  const rm = new ReactionManager(gs, em)
  const registry = new Map<string, IAbilityRule[]>([
    ['wiggles', WigglesAbility],
    // Contesting the play is the challenge card's own entry, so a spec that
    // challenges anything has to carry it.
    [CHAL, ChallengeAbility],
  ])
  if (withDriver) registry.set(DRIVER, DriverAbility)
  // Before TurnManager's listener would matter, and the hero rules come from
  // the real table — this is what production wires.
  new TaskManager(gs, em, rm, registry)
  const tm = new TurnManager(gs, em)

  seat(gs, 'p1', ['wiggles'])
  seat(gs, 'p2', [CHAL], ['victim'])
  gs.registerCard(makeHero('wiggles'))
  gs.registerCard(makeHero('victim'))
  gs.registerCard(
    new ChallengeCard({
      id: CHAL,
      name: 'Challenge',
      type: CardType.Challenge,
      image: '',
      description: '',
      set: 'test',
    }),
  )

  return { gs, em, rm, tm, events }
}

const openWindows = (gs: GameState): IReactionWindow[] =>
  [...gs.getFrames().values()].flatMap((f) => f.windows).filter((w) => w.isOpen())

const windowOfType = (gs: GameState, type: ReactionWindowType) =>
  openWindows(gs).find((w) => w.getType() === type)

const rollOffer = (gs: GameState) =>
  windowOfType(gs, ReactionWindowType.TaskChoice)
const modifierWindow = (gs: GameState) =>
  windowOfType(gs, ReactionWindowType.Modifier)
const challengeWindow = (gs: GameState) =>
  windowOfType(gs, ReactionWindowType.Challenge)

const typesOf = (events: IGameEvent[]) => events.map((e) => e.getType())

describe('hero rules — the roll a played hero is offered', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // Declaration
  // -------------------------------------------------------------------------

  describe('declaration', () => {
    it('is two entries, split at the question', () => {
      expect(heroRules).toHaveLength(2)
      expect(heroRules[0].trigger.on).toBe(GameEventType.FrameResolved)
      expect(heroRules[1].trigger.on).toBe(GameEventType.TaskConfirmed)
      expect(heroRules[1].trigger.when).toBe(OFFERS_ROLL)
    })

    it('does not answer to the label Wiggles already uses for its own prompt', () => {
      // Both are "may I roll?" questions on a hero. Sharing a label would make
      // Wiggles roll on ITSELF the moment it confirmed a roll on its steal.
      expect(OFFERS_ROLL).not.toBe(WigglesAbility[1].trigger.when)
    })
  })

  // -------------------------------------------------------------------------
  // Played by the player — PlayHeroAction
  // -------------------------------------------------------------------------

  describe('played by the player', () => {
    const play = (tm: TurnManager, gs: GameState, em: GameEventEmitter, rm: ReactionManager) => {
      tm.startTurn('p1')
      tm.enqueue(new PlayHeroAction('a1', 'p1', 'wiggles', rm, em))
      return gs
    }

    it('offers no roll until the challenge on it settles', () => {
      const { gs, em, rm, tm } = setup()
      play(tm, gs, em, rm)

      expect(challengeWindow(gs)).toBeDefined()
      expect(rollOffer(gs)).toBeUndefined()
    })

    it('asks about the hero it played, once the challenge lapses', () => {
      const { gs, em, rm, tm, events } = setup()
      play(tm, gs, em, rm)

      jest.advanceTimersByTime(5000)

      expect(rollOffer(gs)).toBeDefined()
      const prompt = events
        .filter((e) => e.getType() === GameEventType.ReactionWindowOpened)
        .map((e) => e.getPayload() as Record<string, unknown>)
        .find((p) => p['confirms'] !== undefined)
      expect(prompt).toMatchObject({
        confirms: OFFERS_ROLL,
        sourceCardId: 'wiggles',
      })
    })

    it('yes: rolls on that hero, for free', () => {
      const { gs, em, rm, tm, events } = setup()
      play(tm, gs, em, rm)
      jest.advanceTimersByTime(5000)

      jest.spyOn(Math, 'random').mockReturnValue(HIGH)
      rollOffer(gs)!.submitReaction('p1', { choice: CONFIRM })

      const rolled = events.find((e) => e.getType() === GameEventType.DiceRolled)
      expect((rolled!.getPayload() as { cardId: string }).cardId).toBe('wiggles')
      expect(modifierWindow(gs)).toBeDefined()
      // One point, spent on the play. The roll is a task and costs nothing.
      expect(gs.getPlayer('p1')!.getActionPoints()).toBe(2)
      expect(tm.getQueuedActions()).toHaveLength(0)
    })

    it('no: the hero stays in the party with its ability unspent', () => {
      const { gs, em, rm, tm } = setup()
      play(tm, gs, em, rm)
      jest.advanceTimersByTime(5000)

      jest.advanceTimersByTime(5000) // the prompt lapses, which is a DISMISS

      expect(gs.getParty('p1').getHeroIds()).toContain('wiggles')
      expect(modifierWindow(gs)).toBeUndefined()
      expect(gs.getAbilitiesUsedThisTurn()).not.toContain('wiggles')
    })

    it('a successful roll runs the hero own ability', () => {
      const { gs, em, rm, tm } = setup()
      play(tm, gs, em, rm)
      jest.advanceTimersByTime(5000)

      jest.spyOn(Math, 'random').mockReturnValue(HIGH)
      rollOffer(gs)!.submitReaction('p1', { choice: CONFIRM })
      jest.advanceTimersByTime(5000) // modifier settles -> RollSuccess

      // Wiggles is asking which hero to steal — nothing else opens that window.
      const choice = windowOfType(gs, ReactionWindowType.CardChoice)
      expect(choice).toBeDefined()
      choice!.submitReaction('p1', { choice: 'victim' })
      expect(gs.getParty('p1').getHeroIds()).toContain('victim')
    })

    it('a failed roll leaves the hero in play and its ability silent', () => {
      const { gs, em, rm, tm, events } = setup()
      play(tm, gs, em, rm)
      jest.advanceTimersByTime(5000)

      jest.spyOn(Math, 'random').mockReturnValue(LOW) // baseRoll 1 < 5
      rollOffer(gs)!.submitReaction('p1', { choice: CONFIRM })
      jest.advanceTimersByTime(5000)

      expect(gs.getParty('p1').getHeroIds()).toContain('wiggles')
      expect(typesOf(events)).not.toContain(GameEventType.RollSuccess)
      // Spent before the roll frame opened, so the rollback keeps it spent.
      expect(gs.getAbilitiesUsedThisTurn()).toContain('wiggles')
    })

    it('a hero that LOSES its challenge is never offered a roll', () => {
      const { gs, em, rm, tm } = setup()
      play(tm, gs, em, rm)

      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(HIGH) // challenger 11
        .mockReturnValueOnce(LOW) // challenged 1
        .mockReturnValue(LOW)
      rm.submitReaction(new PlayChallengeReaction('r1', 'p2', CHAL, 'wiggles'))
      jest.advanceTimersByTime(5000)

      // Rolled back out of the party before FrameResolved, so it was not among
      // the sources the offer is matched against.
      expect(gs.getParty('p1').getHeroIds()).not.toContain('wiggles')
      expect(rollOffer(gs)).toBeUndefined()
      expect(gs.getDiscardPile().getAll()).toContain('wiggles')
    })
  })

  // -------------------------------------------------------------------------
  // The turn cannot end underneath the offer. Playing a hero with the last
  // action point leaves 0 AP and no open window for the instant between the
  // challenge settling and the prompt opening; TurnManager.drain would have
  // called that the end of the turn.
  // -------------------------------------------------------------------------

  describe('the turn while the offer is pending', () => {
    /** p1 down to a single action point, with GameEngine driving resumeDrain. */
    const lastPoint = () => {
      const ctx = setup()
      // After TaskManager, so the offer's window is open by the time
      // FrameResolved reaches resumeDrain.
      new GameEngine(ctx.gs, ctx.tm, ctx.em, [])
      ctx.tm.startTurn('p1')
      ctx.gs.getPlayer('p1')!.decreaseActionPoints(2)
      ctx.tm.enqueue(new PlayHeroAction('a1', 'p1', 'wiggles', ctx.rm, ctx.em))
      return ctx
    }

    it('stays open while the hero is still being asked', () => {
      const { gs, tm } = lastPoint()

      jest.advanceTimersByTime(5000) // challenge lapses -> the offer opens

      expect(gs.getPlayer('p1')!.getActionPoints()).toBe(0)
      expect(rollOffer(gs)).toBeDefined()
      expect(tm.getPhase()).toBe(TurnPhase.Action)
    })

    it('stays open across the roll the offer leads to', () => {
      const { gs, tm } = lastPoint()
      jest.advanceTimersByTime(5000)

      jest.spyOn(Math, 'random').mockReturnValue(HIGH)
      rollOffer(gs)!.submitReaction('p1', { choice: CONFIRM })

      expect(modifierWindow(gs)).toBeDefined()
      expect(tm.getPhase()).toBe(TurnPhase.Action)
    })

    it('ends once the last pipeline is spent', () => {
      const { gs, tm } = lastPoint()
      jest.advanceTimersByTime(5000) // challenge lapses -> offered
      jest.advanceTimersByTime(5000) // the offer lapses, which is a DISMISS

      expect(gs.getPipelines()).toHaveLength(0)
      expect(tm.getPhase()).toBe(TurnPhase.End)
    })

    it('ends after an offered roll that FAILS — the offer is not left parked', () => {
      // The roll's frame opens while the offer is still marked paused on its
      // own frame (TaskConfirmed goes out before FrameResolved). The failed
      // roll's rollback must leave the offer's mark to FrameResolved(offer),
      // and must not resurrect it afterwards.
      const { gs, tm } = lastPoint()
      jest.advanceTimersByTime(5000) // challenge lapses -> offered

      jest.spyOn(Math, 'random').mockReturnValue(LOW) // baseRoll 1 < 5
      rollOffer(gs)!.submitReaction('p1', { choice: CONFIRM })
      jest.advanceTimersByTime(5000) // the roll lapses -> RollFailed, rollback

      expect(gs.getPipelines()).toHaveLength(0)
      expect(tm.getPhase()).toBe(TurnPhase.End)
    })
  })

  // -------------------------------------------------------------------------
  // Played by an ability — PlayHeroTask
  // -------------------------------------------------------------------------

  describe('played by an ability', () => {
    /** Fires the driver, which chooses the hero in hand and plays it. */
    const fireDriver = (gs: GameState, em: GameEventEmitter) => {
      em.emit(new GameEvent(GameEventType.TurnStarted, 'p1', { playerId: 'p1' }))
      windowOfType(gs, ReactionWindowType.CardChoice)!.submitReaction('p1', {
        choice: 'wiggles',
      })
    }

    it('takes the same shape as the action: hand -> party -> challenge', () => {
      const { gs, em } = setup(true)

      fireDriver(gs, em)

      expect(gs.getPlayer('p1')!.getHand()).not.toContain('wiggles')
      expect(gs.getParty('p1').getHeroIds()).toContain('wiggles')
      expect(challengeWindow(gs)).toBeDefined()
      expect(rollOffer(gs)).toBeUndefined()
      // Nothing reached the action queue: a task grants a task.
    })

    it('costs the owner no action point', () => {
      const { gs, em } = setup(true)

      fireDriver(gs, em)

      expect(gs.getPlayer('p1')!.getActionPoints()).toBe(3)
    })

    it('offers the roll once the challenge settles, exactly as the action does', () => {
      const { gs, em } = setup(true)
      fireDriver(gs, em)

      jest.advanceTimersByTime(5000)

      expect(rollOffer(gs)).toBeDefined()
    })

    it('runs the whole cycle through to the hero own ability', () => {
      const { gs, em } = setup(true)
      fireDriver(gs, em)
      jest.advanceTimersByTime(5000) // challenge lapses -> offered

      jest.spyOn(Math, 'random').mockReturnValue(HIGH)
      rollOffer(gs)!.submitReaction('p1', { choice: CONFIRM })
      jest.advanceTimersByTime(5000) // modifier settles -> RollSuccess

      const choice = windowOfType(gs, ReactionWindowType.CardChoice)
      expect(choice).toBeDefined()
      choice!.submitReaction('p1', { choice: 'victim' })
      expect(gs.getParty('p1').getHeroIds()).toContain('victim')
    })

    it('a lost challenge un-plays the hero and cancels the rest of the run', () => {
      const { gs, em, rm } = setup(true)
      fireDriver(gs, em)

      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(HIGH)
        .mockReturnValueOnce(LOW)
        .mockReturnValue(LOW)
      rm.submitReaction(new PlayChallengeReaction('r1', 'p2', CHAL, 'wiggles'))
      jest.advanceTimersByTime(5000)

      expect(gs.getParty('p1').getHeroIds()).not.toContain('wiggles')
      expect(gs.getPlayer('p1')!.getHand()).not.toContain('wiggles')
      expect(gs.getDiscardPile().getAll()).toContain('wiggles')
      expect(rollOffer(gs)).toBeUndefined()
      expect(gs.getPipelines()).toHaveLength(0)
    })
  })
})
