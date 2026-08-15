import {
  CardType,
  GameEventType,
  IGameEvent,
  ReactionType,
  ReactionWindowType,
} from 'shared'
import { PlayChallengeReaction } from './play-challenge-reaction'
import { GameState } from '../game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { NO_CONTEXT_RESULT } from '../ability-context'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { ChallengeCard } from '../cards/challenge-card'
import { IReactionWindow } from '../interfaces'

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
    ability: { trigger: GameEventType.CardPlayAttempted },
  })

const collect = (em: GameEventEmitter): IGameEvent[] => {
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  return events
}

/** Stub challenge window with a jest spy on submitReaction. */
const makeStubWindow = (): IReactionWindow & { submitReaction: jest.Mock } => ({
  getId: () => 'w1',
  getType: () => ReactionWindowType.Challenge,
  isOpen: () => true,
  submitReaction: jest.fn(),
  resolve: () => {},
  resultKey: () => NO_CONTEXT_RESULT,
})

/** Add a challenge frame to gs with a stub window. */
const openFrame = (gs: GameState, stub: IReactionWindow) => {
  const frameId = 'frame-1'
  gs.addFrame(frameId, { snapshot: gs.clone(), windows: [stub] })
  return frameId
}

const makeReaction = (targetedCardId = 'hero-1') =>
  new PlayChallengeReaction('r1', 'p1', 'chal-1', targetedCardId)

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
    gs.registerPlayer(makePlayer('p1', ['chal-1']))
    gs.registerParty(makeParty('p1'))
    gs.registerCard(makeChallengeCard('chal-1'))
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
    expect(makeReaction().canExecute(gs)).toBe(false)
  })

  it('canExecute returns false when card not in player hand', () => {
    gs.getPlayer('p1')!.removeFromHand('chal-1')
    const stub = makeStubWindow()
    openFrame(gs, stub)
    expect(makeReaction().canExecute(gs)).toBe(false)
  })

  it('canExecute returns false when target card already challenged this turn', () => {
    const stub = makeStubWindow()
    openFrame(gs, stub)
    gs.markCardChallenged('hero-1')
    expect(makeReaction().canExecute(gs)).toBe(false)
  })

  it('canExecute returns true when frame is open, card is in hand, target not yet challenged', () => {
    const stub = makeStubWindow()
    openFrame(gs, stub)
    expect(makeReaction().canExecute(gs)).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // execute
  // ---------------------------------------------------------------------------

  describe('execute', () => {
    let stub: IReactionWindow & { submitReaction: jest.Mock }
    let frameId: string

    beforeEach(() => {
      stub = makeStubWindow()
      frameId = openFrame(gs, stub)
    })

    it('removes the challenge card from the current player hand', () => {
      makeReaction().execute(gs, em)
      expect(gs.getPlayer('p1')!.getHand()).not.toContain('chal-1')
    })

    it('adds the challenge card to the current discard pile', () => {
      makeReaction().execute(gs, em)
      expect(gs.getDiscardPile().getAll()).toContain('chal-1')
    })

    it('removes the challenge card from the snapshot player hand', () => {
      makeReaction().execute(gs, em)
      const snapshot = gs.frames.get(frameId)?.snapshot
      expect(snapshot?.getPlayer('p1')?.getHand()).not.toContain('chal-1')
    })

    it('adds the challenge card to the snapshot discard pile', () => {
      makeReaction().execute(gs, em)
      const snapshot = gs.frames.get(frameId)?.snapshot
      expect(snapshot?.getDiscardPile().getAll()).toContain('chal-1')
    })

    it('calls window.submitReaction with { type: "challenge", challengerId }', () => {
      makeReaction().execute(gs, em)
      expect(stub.submitReaction).toHaveBeenCalledWith('p1', {
        type: 'challenge',
        challengerId: 'p1',
      })
    })

    it('does nothing when no challenge frame is open', () => {
      gs.releaseFrame(frameId)
      expect(() => makeReaction().execute(gs, em)).not.toThrow()
      expect(stub.submitReaction).not.toHaveBeenCalled()
    })
  })
})
