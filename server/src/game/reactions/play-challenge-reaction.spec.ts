import { CardType, GameEventType, IGameEvent, ReactionType, ReactionWindowType, RefusalReason } from 'shared'
import { PlayChallengeReaction } from './play-challenge-reaction'
import { GameState } from '../pipelines/game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { NO_CONTEXT_RESULT } from '../abilities/ability-context'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { ChallengeCard } from '../cards/challenge-card'
import { accepted, IModifiableWindow, IReactionWindow } from '../interfaces'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeGs = () =>
  new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

const makePlayer = (id: string, hand: string[] = []) =>
  new Player({ id, name: id, hand, partyId: `${id}-party`, actionPoints: 3 })

const makeParty = (playerId: string) =>
  new Party({
    playerId,
    leaderId: `${playerId}-leader`,
    heroIds: [],
    monsterIds: [],
  })

const makeChallengeCard = (id: string) =>
  new ChallengeCard({
    id,
    name: id,
    type: CardType.Challenge,
    image: '',
    description: '',
    set: '',
  })

const collect = (em: GameEventEmitter): IGameEvent[] => {
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  return events
}

/**
 * Stub challenge window. `cardSpent` is declared because the reaction probes
 * for that capability to keep the contest alive while the card resolves.
 */
const makeStubWindow = (): IModifiableWindow & {
  submitReaction: jest.Mock
  cardSpent: jest.Mock
} => ({
  getId: () => 'w1',
  getType: () => ReactionWindowType.Challenge,
  getRespondentId: () => 'defender',
  getOptions: () => [],
  isOpen: () => true,
  submitReaction: jest.fn(),
  resolve: () => {},
  resultKey: () => NO_CONTEXT_RESULT,
  getDetail: () => ({}),
  getDeadline: () => 0,
  acceptsModifierFor: () => accepted(),
  cardSpent: jest.fn(),
  valueBiasFor: () => 'highest' as const,
})

/** Add a challenge frame to gs with a stub window. */
const openFrame = (gs: GameState, stub: IReactionWindow) => {
  const frameId = 'frame-1'
  gs.addFrame(frameId, { snapshot: gs.clone(), windows: [stub] })
  return frameId
}

const CHAL = 'challenge-102'

const makeReaction = (targetedCardId = 'hero-1') =>
  new PlayChallengeReaction('r1', 'p1', CHAL, targetedCardId)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlayChallengeReaction', () => {
  let gs: GameState
  let em: GameEventEmitter
  let events: IGameEvent[]

  beforeEach(() => {
    gs = makeGs()
    em = new GameEventEmitter()
    events = collect(em)
    gs.registerPlayer(makePlayer('p1', [CHAL]))
    gs.registerParty(makeParty('p1'))
    gs.registerCard(makeChallengeCard(CHAL))
  })

  // ---------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------

  it('getId returns the reaction id', () => {
    expect(makeReaction().getId()).toBe('r1')
  })

  it('getType returns ReactionType.Challenge', () => {
    expect(makeReaction().getType()).toBe(ReactionType.Challenge)
  })

  it('getPlayerId returns the player id', () => {
    expect(makeReaction().getPlayerId()).toBe('p1')
  })

  // ---------------------------------------------------------------------------
  // canExecute
  // ---------------------------------------------------------------------------

  it('canExecute returns false when no challenge frame is open', () => {
    expect(makeReaction().canExecute(gs)).toEqual({ accepted: false, reason: RefusalReason.NoChallengeWindow })
  })

  it('canExecute returns false when card not in player hand', () => {
    gs.getPlayer('p1')!.removeFromHand(CHAL)
    const stub = makeStubWindow()
    openFrame(gs, stub)
    expect(makeReaction().canExecute(gs)).toEqual({ accepted: false, reason: RefusalReason.CardNotInHand })
  })

  it('canExecute returns false when target card already challenged this turn', () => {
    const stub = makeStubWindow()
    openFrame(gs, stub)
    gs.markCardChallenged('hero-1')
    expect(makeReaction().canExecute(gs)).toEqual({ accepted: false, reason: RefusalReason.AlreadyChallengedThisTurn })
  })

  it('canExecute returns true when frame is open, card is in hand, target not yet challenged', () => {
    const stub = makeStubWindow()
    openFrame(gs, stub)
    expect(makeReaction().canExecute(gs)).toEqual({ accepted: true })
  })

  // ---------------------------------------------------------------------------
  // execute
  // ---------------------------------------------------------------------------

  it('canExecute refuses the defender contesting their own play', () => {
    openFrame(gs, { ...makeStubWindow(), getRespondentId: () => 'p1' })
    expect(makeReaction().canExecute(gs)).toEqual({
      accepted: false,
      reason: RefusalReason.CannotChallengeOwnCard,
    })
  })

  describe('execute', () => {
    let stub: ReturnType<typeof makeStubWindow>
    let frameId: string

    beforeEach(() => {
      stub = makeStubWindow()
      frameId = openFrame(gs, stub)
    })

    it('removes the challenge card from the current player hand', () => {
      makeReaction().execute(gs, em)
      expect(gs.getPlayer('p1')!.getHand()).not.toContain(CHAL)
    })

    it('puts it in the INSTANCE pile — it is on the table while the contest is', () => {
      makeReaction().execute(gs, em)
      expect(gs.getParty('p1').getInstanceCardIds()).toContain(CHAL)
      expect(gs.getDiscardPile().getAll()).not.toContain(CHAL)
    })

    it('releasing the frame is what discards it', () => {
      makeReaction().execute(gs, em)
      gs.releaseFrame(frameId)
      expect(gs.getDiscardPile().getAll()).toContain(CHAL)
    })

    it('a ROLLBACK still leaves it spent', () => {
      makeReaction().execute(gs, em)
      gs.restoreFrame(frameId)

      expect(gs.getPlayer('p1')!.getHand()).not.toContain(CHAL)
      expect(gs.getDiscardPile().getAll()).toContain(CHAL)
    })

    it('does NOT contest the play itself — StartChallengeTask does', () => {
      makeReaction().execute(gs, em)
      expect(stub.submitReaction).not.toHaveBeenCalled()
    })

    it('announces ChallengePlayed, naming the card and its target', () => {
      const seen = collect(em)
      makeReaction().execute(gs, em)

      const played = seen.filter(
        (e) => e.getType() === GameEventType.ChallengePlayed,
      )
      expect(played).toHaveLength(1)
      expect(played[0].getPlayerId()).toBe('p1')
      expect(played[0].getPayload()).toEqual({
        cardId: CHAL,
        targetedCardId: 'hero-1',
      })
    })

    it('keeps the contest alive while the card resolves', () => {
      makeReaction().execute(gs, em)
      expect(stub.cardSpent).toHaveBeenCalled()
    })

    it('does nothing when no challenge frame is open', () => {
      gs.releaseFrame(frameId)
      expect(() => makeReaction().execute(gs, em)).not.toThrow()
      expect(gs.getPlayer('p1')!.getHand()).toContain(CHAL)
    })
  })
})
