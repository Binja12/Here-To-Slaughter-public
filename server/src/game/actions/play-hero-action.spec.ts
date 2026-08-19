import {
  ActionType,
  CardType,
  GameEventType,
  HeroClass,
  ReactionWindowType,
} from 'shared'
import { PlayHeroAction } from './play-hero-action'
import { GameState } from '../pipelines/game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { ReactionManager } from '../pipelines/reaction-manager'
import { HeroCard } from '../cards/hero-card'
import { RollOnHeroAction } from './roll-on-hero-action'
import { IAction, IActionQueue } from '../interfaces'
import { TurnManager } from '../pipelines/turn-manager'

// --- Helpers ---

const makePlayer = (id: string, hand: string[] = [], ap = 3) =>
  new Player({
    id,
    name: `Player ${id}`,
    hand,
    partyId: `party-${id}`,
    actionPoints: ap,
  })

const makeParty = (playerId: string, heroIds: string[] = []) =>
  new Party({
    playerId,
    leaderId: `leader-${playerId}`,
    heroIds,
    monsterIds: [],
  })

const makeHeroCard = (id: string) =>
  new HeroCard({
    id,
    name: `Hero ${id}`,
    type: CardType.Hero,
    image: '',
    description: '',
    heroClass: HeroClass.Wizard,
    rollReq: 4,
    set: '',
  })

/**
 * Records what the action pushes to the front of the queue without running it —
 * PlayHeroAction's contract is that it QUEUES the free roll, not that it rolls.
 */
const makeQueue = () => {
  const queued: IAction[] = []
  const queue: IActionQueue = { enqueueFirst: (a) => { queued.push(a) } }
  return { queue, queued }
}

const makeGs = () => {
  const deck = new CardStack('deck-1', 'main-deck')
  const discardPile = new CardPile('discard pile', 'discard pile')
  const monsterDeck = new CardStack('monster deck', 'main monster deck')
  const monsterPile = new CardPile('slayable monsters', 'monster pile')
  return new GameState(deck, discardPile, monsterDeck, monsterPile)
}

// --- Tests ---

describe('PlayHeroAction', () => {
  let emitter: GameEventEmitter
  let emitSpy: jest.SpyInstance
  let gs: GameState
  let player: Player
  let party: Party

  beforeEach(() => {
    jest.useFakeTimers()
    emitter = new GameEventEmitter()
    emitSpy = jest.spyOn(emitter, 'emit')
    gs = makeGs()
    player = makePlayer('p1', ['hero-1'])
    party = makeParty('p1')
    gs.registerPlayer(player)
    gs.registerParty(party)
    gs.setCurrentPlayerId('p1')
    gs.registerCard(makeHeroCard('hero-1'))
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  const makeAction = (queue: IActionQueue = makeQueue().queue) => {
    const rm = new ReactionManager(gs, emitter)
    return new PlayHeroAction('a1', 'p1', 'hero-1', rm, emitter, queue)
  }

  // --- Metadata ---

  describe('metadata', () => {
    it('getId returns the action id', () => {
      expect(makeAction().getId()).toBe('a1')
    })

    it('getType returns ActionType.PlayHero', () => {
      expect(makeAction().getType()).toBe(ActionType.PlayHero)
    })

    it('getPlayerId returns the player id', () => {
      expect(makeAction().getPlayerId()).toBe('p1')
    })

    it('getCost returns 1', () => {
      expect(makeAction().getCost()).toBe(1)
    })
  })

  // --- canExecute ---

  describe('canExecute', () => {
    it('returns false when player does not exist', () => {
      const emptyGs = makeGs()
      emptyGs.setCurrentPlayerId('p1')
      const rm = new ReactionManager(emptyGs, emitter)
      const action = new PlayHeroAction('a1', 'p1', 'hero-1', rm, emitter, makeQueue().queue)
      expect(action.canExecute(emptyGs)).toBe(false)
    })

    it('returns false when player is not the current player', () => {
      gs.setCurrentPlayerId('p2')
      expect(makeAction().canExecute(gs)).toBe(false)
    })

    it('returns false when player has insufficient action points', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', ['hero-1'], 0))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      const rm = new ReactionManager(gs2, emitter)
      const action = new PlayHeroAction('a1', 'p1', 'hero-1', rm, emitter, makeQueue().queue)
      expect(action.canExecute(gs2)).toBe(false)
    })

    it('returns false when card is not in player hand', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', []))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      const rm = new ReactionManager(gs2, emitter)
      const action = new PlayHeroAction('a1', 'p1', 'hero-1', rm, emitter, makeQueue().queue)
      expect(action.canExecute(gs2)).toBe(false)
    })

    it('returns true when all conditions are met', () => {
      expect(makeAction().canExecute(gs)).toBe(true)
    })
  })

  // --- execute ---

  describe('execute', () => {
    it('decreases player action points by 1', () => {
      makeAction().execute(gs)
      expect(player.getActionPoints()).toBe(2)
    })

    it('removes the card from player hand', () => {
      makeAction().execute(gs)
      expect(player.getHand()).not.toContain('hero-1')
    })

    it('adds the hero to the player party', () => {
      makeAction().execute(gs)
      expect(party.getHeroIds()).toContain('hero-1')
    })

    it('emits three events: hand removal, party arrival, challenge window opened', () => {
      makeAction().execute(gs)
      expect(emitSpy).toHaveBeenCalledTimes(3)
      const types = emitSpy.mock.calls.map((c) => c[0].getType())
      // The hand removal used to be emitted AS HeroAddedToParty, so a hero play
      // announced its arrival twice and any ability watching for it fired twice.
      expect(types).toEqual([
        GameEventType.CardRemovedFromHand,
        GameEventType.HeroAddedToParty,
        GameEventType.ReactionWindowOpened,
      ])
    })
  })

  // --- the challenge window the play opens ---

  describe('challenge window', () => {
    /**
     * Drives the window the action opened to a decided outcome.
     * `challengerWins` picks the two rolls ChallengeWindow makes in
     * startChallenge — challenger first, then challenged.
     */
    const settleChallenge = (challengerWins: boolean) => {
      const entry = gs.getFrameByWindowType(ReactionWindowType.Challenge)!
      const win = entry.frame.windows.find(
        (w) => w.getType() === ReactionWindowType.Challenge,
      )!
      jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(challengerWins ? 0.99 : 0)
        .mockReturnValueOnce(challengerWins ? 0 : 0.99)
      win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      win.resolve()
    }

    it('opens a challenge window naming the played card', () => {
      makeAction().execute(gs)
      const entry = gs.getFrameByWindowType(ReactionWindowType.Challenge)
      expect(entry).toBeDefined()
      expect(gs.hasOpenFrames()).toBe(true)
    })

    it('snapshots AFTER the hand removal, so a rollback cannot un-play the card', () => {
      makeAction().execute(gs)
      const { frame } = gs.getFrameByWindowType(ReactionWindowType.Challenge)!
      expect(frame.snapshot.getPlayer('p1')!.getHand()).not.toContain('hero-1')
    })

    it('snapshots BEFORE the party arrival, so a rollback un-does the play', () => {
      makeAction().execute(gs)
      const { frame } = gs.getFrameByWindowType(ReactionWindowType.Challenge)!
      expect(frame.snapshot.getParty('p1').getHeroIds()).not.toContain('hero-1')
    })

    it('keeps the hero when the challenge is not taken up', () => {
      makeAction().execute(gs)
      const entry = gs.getFrameByWindowType(ReactionWindowType.Challenge)!
      entry.frame.windows[0].resolve() // times out uncontested
      expect(party.getHeroIds()).toContain('hero-1')
      expect(gs.hasOpenFrames()).toBe(false)
    })

    it('keeps the hero when the player wins the challenge', () => {
      makeAction().execute(gs)
      settleChallenge(false)
      expect(gs.getParty('p1').getHeroIds()).toContain('hero-1')
    })

    it('removes the hero from the party when the challenge is lost', () => {
      makeAction().execute(gs)
      settleChallenge(true)
      expect(gs.getParty('p1').getHeroIds()).not.toContain('hero-1')
    })

    it('does NOT return the card to hand when the challenge is lost', () => {
      makeAction().execute(gs)
      settleChallenge(true)
      expect(gs.getPlayer('p1')!.getHand()).not.toContain('hero-1')
    })

    it('un-grants the free roll when the challenge is lost', () => {
      // The queue lives on GameState, so a rollback un-grants the roll.
      const rm = new ReactionManager(gs, emitter)
      const tm = new TurnManager(gs, emitter)
      tm.startTurn('p1')
      new PlayHeroAction('a1', 'p1', 'hero-1', rm, emitter, tm).execute(gs)
      expect(gs.actionQueue).toHaveLength(1)
      settleChallenge(true)
      expect(gs.actionQueue).toHaveLength(0)
    })

    it('keeps the free roll queued when the challenge is won', () => {
      const rm = new ReactionManager(gs, emitter)
      const tm = new TurnManager(gs, emitter)
      tm.startTurn('p1')
      new PlayHeroAction('a1', 'p1', 'hero-1', rm, emitter, tm).execute(gs)
      settleChallenge(false)
      expect(gs.actionQueue).toHaveLength(1)
      expect(gs.actionQueue[0].getType()).toBe(ActionType.RollOnHero)
    })

    it('opens exactly one frame — an action cannot leak one to an ability', () => {
      const rm = new ReactionManager(gs, emitter)
      new PlayHeroAction('a1', 'p1', 'hero-1', rm, emitter, makeQueue().queue).execute(gs)
      // There is no shared frameId slot to leak any more: a task hands its
      // frameId back from execute(), so an action's frame is only ever its own.
      expect(gs.frames.size).toBe(1)
    })
  })

  // --- the roll the play grants ---

  describe('granted roll', () => {
    it('queues a roll on the hero it just played', () => {
      const { queue, queued } = makeQueue()
      makeAction(queue).execute(gs)
      expect(queued).toHaveLength(1)
      expect(queued[0]).toBeInstanceOf(RollOnHeroAction)
      expect(queued[0].getType()).toBe(ActionType.RollOnHero)
      expect(queued[0].getPlayerId()).toBe('p1')
    })

    it('grants the roll for free — the point was spent on the play', () => {
      const { queue, queued } = makeQueue()
      makeAction(queue).execute(gs)
      expect(queued[0].getCost()).toBe(0)
    })

    it('queues the roll only after the hero is in the party, so it can execute', () => {
      const { queue, queued } = makeQueue()
      makeAction(queue).execute(gs)
      expect(queued[0].canExecute(gs)).toBe(true)
    })

    it('grants the roll even when the play spent the last action point', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', ['hero-1'], 1))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      gs2.registerCard(makeHeroCard('hero-1'))
      const { queue, queued } = makeQueue()
      const rm = new ReactionManager(gs2, emitter)
      new PlayHeroAction('a1', 'p1', 'hero-1', rm, emitter, queue).execute(gs2)
      expect(gs2.getPlayer('p1')!.getActionPoints()).toBe(0)
      expect(queued[0].canExecute(gs2)).toBe(true)
    })
  })
})
