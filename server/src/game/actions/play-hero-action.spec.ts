import { ActionType, CardType, GameEventType, HeroClass, ReactionWindowType, RefusalReason } from 'shared'
import { PlayHeroAction } from './play-hero-action'
import { GameState } from '../pipelines/game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { ReactionManager } from '../pipelines/reaction-manager'
import { HeroCard } from '../cards/hero-card'

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

  const makeAction = () => {
    const rm = new ReactionManager(gs, emitter)
    return new PlayHeroAction('a1', 'p1', 'hero-1', rm, emitter)
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
    it('throws when the player is not seated — an engine mistake, not a refusal', () => {
      const emptyGs = makeGs()
      emptyGs.setCurrentPlayerId('p1')
      const rm = new ReactionManager(emptyGs, emitter)
      const action = new PlayHeroAction('a1', 'p1', 'hero-1', rm, emitter)
      expect(() => action.canExecute(emptyGs)).toThrow(/not seated/)
    })

    it('returns false when player has insufficient action points', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', ['hero-1'], 0))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      const rm = new ReactionManager(gs2, emitter)
      const action = new PlayHeroAction('a1', 'p1', 'hero-1', rm, emitter)
      expect(action.canExecute(gs2)).toEqual({ accepted: false, reason: RefusalReason.NoActionPoints })
    })

    it('returns false when card is not in player hand', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', []))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      const rm = new ReactionManager(gs2, emitter)
      const action = new PlayHeroAction('a1', 'p1', 'hero-1', rm, emitter)
      expect(action.canExecute(gs2)).toEqual({ accepted: false, reason: RefusalReason.CardNotInHand })
    })

    it('returns true when all conditions are met', () => {
      expect(makeAction().canExecute(gs)).toEqual({ accepted: true })
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
      expect(frame.snapshot.board.getPlayer('p1')!.getHand()).not.toContain('hero-1')
    })

    it('snapshots BEFORE the party arrival, so a rollback un-does the play', () => {
      makeAction().execute(gs)
      const { frame } = gs.getFrameByWindowType(ReactionWindowType.Challenge)!
      expect(frame.snapshot.board.getParty('p1').getHeroIds()).not.toContain('hero-1')
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

    it('queues nothing — the roll it offers is a TASK, and the hero owns it', () => {
      makeAction().execute(gs)
      settleChallenge(false)
    })

    it('opens exactly one frame — an action cannot leak one to an ability', () => {
      const rm = new ReactionManager(gs, emitter)
      new PlayHeroAction('a1', 'p1', 'hero-1', rm, emitter).execute(gs)
      // There is no shared frameId slot to leak any more: a task hands its
      // frameId back from execute(), so an action's frame is only ever its own.
      expect(gs.getFrames().size).toBe(1)
    })
  })

})
