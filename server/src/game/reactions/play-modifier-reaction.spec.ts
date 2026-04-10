import {
  CardType,
  GameEventType,
  IGameEvent,
  ReactionType,
  ReactionWindowType,
} from 'shared'
import { PlayModifierReaction } from './play-modifier-reaction'
import { GameState } from '../game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { ModifierCard } from '../cards/modifier-card'
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

const makeModifierCard = (id: string) =>
  new ModifierCard({
    id,
    name: id,
    type: CardType.Modifier,
    image: '',
    description: '',
    set: '',
    ability: { trigger: GameEventType.ModifierWindowOpened },
    values: [2],
  })

const collect = (em: GameEventEmitter): IGameEvent[] => {
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  return events
}

/** Stub modifier window with a jest spy on submitReaction. */
const makeStubWindow = (): IReactionWindow & { submitReaction: jest.Mock } => ({
  getId: () => 'w1',
  getType: () => ReactionWindowType.Modifier,
  isOpen: () => true,
  submitReaction: jest.fn(),
  resolve: () => {},
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

    //should not emit discard event
    // it('emits CardDiscarded for the sender', () => {
    //   makeReaction().execute(gs, em)
    //   const e = events.find((e) => e.getType() === GameEventType.CardDiscarded)
    //   expect(e).toBeDefined()
    //   expect(e!.getPlayerId()).toBe('p1')
    //   expect((e!.getPayload() as any).cardId).toBe('mod-1')
    // })

    it('calls window.submitReaction with { value, targetPlayerId }', () => {
      makeReaction(3, 'p2').execute(gs, em)
      expect(stub.submitReaction).toHaveBeenCalledWith('p1', {
        value: 3,
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
