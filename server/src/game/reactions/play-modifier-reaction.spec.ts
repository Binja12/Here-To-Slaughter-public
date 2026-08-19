import {
  CardType,
  GameEventType,
  IGameEvent,
  ReactionType,
  ReactionWindowType,
} from 'shared'
import { PlayModifierReaction } from './play-modifier-reaction'
import { GameState } from '../pipelines/game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { NO_CONTEXT_RESULT } from '../abilities/ability-context'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { ModifierCard } from '../cards/modifier-card'
import { IModifiableWindow, IReactionWindow } from '../interfaces'
import { ModifierWindow } from './modifier-window'

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

const makeModifierCard = (id: string) =>
  new ModifierCard({
    id,
    name: id,
    type: CardType.Modifier,
    image: '',
    description: '',
    set: '',
    // No ability: a modifier is played by a player REQUEST gated on an open
    // modifier frame (canExecute below), never by a passive trigger.
    values: [2],
  })

const collect = (em: GameEventEmitter): IGameEvent[] => {
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  return events
}

/**
 * Stub modifier window with a jest spy on submitReaction.
 * Declares acceptsModifierFor because that capability — not the concrete class
 * — is what PlayModifierReaction looks for.
 */
const makeStubWindow = (
  rollerId = 'p1',
): IModifiableWindow & { submitReaction: jest.Mock } => ({
  getId: () => 'w1',
  getType: () => ReactionWindowType.Modifier,
  isOpen: () => true,
  submitReaction: jest.fn(),
  resolve: () => {},
  resultKey: () => NO_CONTEXT_RESULT,
  acceptsModifierFor: (playerId: string) => playerId === rollerId,
})

/** Add a modifier frame to gs with a stub window. */
const openFrame = (gs: GameState, stub: IReactionWindow) => {
  const frameId = 'frame-1'
  gs.addFrame(frameId, { snapshot: gs.clone(), windows: [stub] })
  return frameId
}

const makeReaction = (value = 2, targetPlayerId = 'p1') =>
  new PlayModifierReaction('r1', 'p1', 'mod-1', value, targetPlayerId)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlayModifierReaction — target must be the roller', () => {
  let gs: GameState
  let em: GameEventEmitter

  /** A REAL ModifierWindow: the guard is instanceof-gated, a stub would skip it. */
  const openRealWindow = (rollerId: string) => {
    const win = new ModifierWindow('w1', rollerId, 3, 5, 'hero-1', 5000, gs, 'f1', em)
    gs.addFrame('f1', { snapshot: gs.clone(), windows: [win] })
    return win
  }

  beforeEach(() => {
    jest.useFakeTimers()
    gs = makeGs()
    em = new GameEventEmitter()
    gs.registerPlayer(makePlayer('p1', []))
    gs.registerPlayer(makePlayer('p2', ['mod-1']))
    gs.registerParty(makeParty('p1'))
    gs.registerParty(makeParty('p2'))
    gs.registerCard(makeModifierCard('mod-1'))
  })
  afterEach(() => jest.useRealTimers())

  it('canExecute is true when the target IS the roller', () => {
    openRealWindow('p1')
    const r = new PlayModifierReaction('r1', 'p2', 'mod-1', 2, 'p1')
    expect(r.canExecute(gs)).toBe(true)
  })

  it('canExecute is false when the target is not the roller', () => {
    openRealWindow('p1')
    const r = new PlayModifierReaction('r1', 'p2', 'mod-1', 2, 'p2')
    expect(r.canExecute(gs)).toBe(false)
  })

  it('a refused modifier is NOT burned — execute() burns before it submits', () => {
    openRealWindow('p1')
    const r = new PlayModifierReaction('r1', 'p2', 'mod-1', 2, 'p2')

    // The manager gate is what protects the card; going straight to execute()
    // would spend it on a bonus the window then discards.
    if (r.canExecute(gs)) r.execute(gs, em)

    expect(gs.getPlayer('p2')!.getHand()).toContain('mod-1')
    expect(gs.getDiscardPile().getAll()).not.toContain('mod-1')
  })
})

describe('PlayModifierReaction', () => {
  let gs: GameState
  let em: GameEventEmitter
  let events: IGameEvent[]

  beforeEach(() => {
    gs = makeGs()
    em = new GameEventEmitter()
    events = collect(em)
    gs.registerPlayer(makePlayer('p1', ['mod-1']))
    gs.registerParty(makeParty('p1'))
    gs.registerCard(makeModifierCard('mod-1'))
  })

  // ---------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------

  it('getId returns the reaction id', () => {
    expect(makeReaction().getId()).toBe('r1')
  })

  it('getType returns ReactionType.ApplyModifier', () => {
    expect(makeReaction().getType()).toBe(ReactionType.ApplyModifier)
  })

  it('getPlayerId returns the player id', () => {
    expect(makeReaction().getPlayerId()).toBe('p1')
  })

  // ---------------------------------------------------------------------------
  // canExecute
  // ---------------------------------------------------------------------------

  it('canExecute returns false when no modifier frame is open', () => {
    expect(makeReaction().canExecute(gs)).toBe(false)
  })

  it('canExecute returns false when card not in player hand', () => {
    gs.getPlayer('p1')!.removeFromHand('mod-1')
    const stub = makeStubWindow()
    openFrame(gs, stub)
    expect(makeReaction().canExecute(gs)).toBe(false)
  })

  it('canExecute returns true when frame is open and card is in hand', () => {
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

    it('removes the modifier card from the current player hand', () => {
      makeReaction().execute(gs, em)
      expect(gs.getPlayer('p1')!.getHand()).not.toContain('mod-1')
    })

    it('adds the modifier card to the current discard pile', () => {
      makeReaction().execute(gs, em)
      expect(gs.getDiscardPile().getAll()).toContain('mod-1')
    })

    it('removes the modifier card from the snapshot player hand', () => {
      makeReaction().execute(gs, em)
      const snapshot = gs.frames.get(frameId)?.snapshot
      expect(snapshot?.getPlayer('p1')?.getHand()).not.toContain('mod-1')
    })

    it('adds the modifier card to the snapshot discard pile', () => {
      makeReaction().execute(gs, em)
      const snapshot = gs.frames.get(frameId)?.snapshot
      expect(snapshot?.getDiscardPile().getAll()).toContain('mod-1')
    })

    // should not emit discard event it('emits CardDiscarded for the sender', ()...

    it('emits ModifierPlayed naming the card, value and target', () => {
      const stub = makeStubWindow()
      openFrame(gs, stub)
      const events = collect(em)

      makeReaction(3, 'p1').execute(gs, em)

      const played = events.filter(
        (e) => e.getType() === GameEventType.ModifierPlayed,
      )
      expect(played).toHaveLength(1)
      expect(played[0].getPlayerId()).toBe('p1')
      expect(played[0].getPayload()).toEqual({
        cardId: 'mod-1',
        value: 3,
        targetPlayerId: 'p1',
      })
    })

    it('announces the play BEFORE the window applies it', () => {
      const gs2 = makeGs()
      const em2 = new GameEventEmitter()
      gs2.registerPlayer(makePlayer('p1', ['mod-1']))
      gs2.registerParty(makeParty('p1'))
      gs2.registerCard(makeModifierCard('mod-1'))
      // A REAL window, so ModifierApplied actually follows.
      const win = new ModifierWindow('w1', 'p1', 3, 5, 'hero-1', 5000, gs2, 'f1', em2)
      gs2.addFrame('f1', { snapshot: gs2.clone(), windows: [win] })
      const events = collect(em2)

      new PlayModifierReaction('r1', 'p1', 'mod-1', 3, 'p1').execute(gs2, em2)

      const order = events
        .map((e) => e.getType())
        .filter(
          (t) =>
            t === GameEventType.ModifierPlayed ||
            t === GameEventType.ModifierApplied,
        )
      expect(order).toEqual([
        GameEventType.ModifierPlayed,
        GameEventType.ModifierApplied,
      ])
    })

    it('calls window.submitReaction with { value, cardId, targetPlayerId }', () => {
      makeReaction(3, 'p2').execute(gs, em)
      // cardId rides along so the window can record WHICH card paid for the
      // bonus — a roll is shown broken down by source, not as one total.
      expect(stub.submitReaction).toHaveBeenCalledWith('p1', {
        type: 'modifier',
        value: 3,
        cardId: 'mod-1',
        targetPlayerId: 'p2',
      })
    })

    it('does nothing when no modifier frame is open', () => {
      gs.releaseFrame(frameId) // close frame
      expect(() => makeReaction().execute(gs, em)).not.toThrow()
      expect(stub.submitReaction).not.toHaveBeenCalled()
    })
  })
})
