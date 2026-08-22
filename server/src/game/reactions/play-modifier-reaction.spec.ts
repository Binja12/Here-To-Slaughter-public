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
import {
  CTX_MODIFIER_TARGET,
  NO_CONTEXT_RESULT,
} from '../abilities/ability-context'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { ModifierCard } from '../cards/modifier-card'
import { IModifiableWindow, IReactionWindow } from '../interfaces'
import { ModifierWindow } from './modifier-window'

// ---------------------------------------------------------------------------
// PlayModifierReaction — the PLAY, and nothing else.
//
// What the card is WORTH is its own registry entry (modifier-ability.ts). This
// spends the card, keeps the roll alive and announces it. The value used to
// arrive here as a constructor argument off a socket, compared with nothing;
// there is no value here at all any more.
// ---------------------------------------------------------------------------

const MOD = 'modifier-077'

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
    values: [2, -2],
  })

const collect = (em: GameEventEmitter): IGameEvent[] => {
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  return events
}

/**
 * Stub modifier window. Declares `acceptsModifierFor` and `cardSpent` because
 * that CAPABILITY — not the concrete class — is what the reaction looks for.
 */
const makeStubWindow = (
  rollerId = 'p1',
): IModifiableWindow & {
  submitReaction: jest.Mock
  cardSpent: jest.Mock
} => ({
  getId: () => 'w1',
  getType: () => ReactionWindowType.Modifier,
  getRespondentId: () => rollerId,
  getOptions: () => [],
  isOpen: () => true,
  submitReaction: jest.fn(),
  resolve: () => {},
  resultKey: () => NO_CONTEXT_RESULT,
  acceptsModifierFor: (playerId: string) => playerId === rollerId,
  cardSpent: jest.fn(),
  valueBiasFor: () => 'highest' as const,
})

const openFrame = (gs: GameState, stub: IReactionWindow) => {
  const frameId = 'frame-1'
  gs.addFrame(frameId, { snapshot: gs.clone(), windows: [stub] })
  return frameId
}

const makeReaction = (targetPlayerId = 'p1') =>
  new PlayModifierReaction('r1', 'p1', MOD, targetPlayerId)

describe('PlayModifierReaction — target must be the roller', () => {
  let gs: GameState
  let em: GameEventEmitter

  /** A REAL ModifierWindow: the guard is the window's own, a stub would skip it. */
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
    gs.registerPlayer(makePlayer('p2', [MOD]))
    gs.registerParty(makeParty('p1'))
    gs.registerParty(makeParty('p2'))
    gs.registerCard(makeModifierCard(MOD))
  })
  afterEach(() => jest.useRealTimers())

  it('canExecute is true when the target IS the roller', () => {
    openRealWindow('p1')
    expect(new PlayModifierReaction('r1', 'p2', MOD, 'p1').canExecute(gs)).toBe(
      true,
    )
  })

  it('canExecute is false when the target is not the roller', () => {
    openRealWindow('p1')
    expect(new PlayModifierReaction('r1', 'p2', MOD, 'p2').canExecute(gs)).toBe(
      false,
    )
  })

  it('a refused modifier is NOT burned — execute() spends before anything lands', () => {
    openRealWindow('p1')
    const r = new PlayModifierReaction('r1', 'p2', MOD, 'p2')

    if (r.canExecute(gs)) r.execute(gs, em)

    expect(gs.getPlayer('p2')!.getHand()).toContain(MOD)
    expect(gs.getParty('p2').getInstanceCardIds()).not.toContain(MOD)
  })
})

describe('PlayModifierReaction', () => {
  let gs: GameState
  let em: GameEventEmitter

  beforeEach(() => {
    gs = makeGs()
    em = new GameEventEmitter()
    gs.registerPlayer(makePlayer('p1', [MOD]))
    gs.registerParty(makeParty('p1'))
    gs.registerCard(makeModifierCard(MOD))
  })

  it('getId returns the reaction id', () => {
    expect(makeReaction().getId()).toBe('r1')
  })

  it('getType returns ReactionType.ApplyModifier', () => {
    expect(makeReaction().getType()).toBe(ReactionType.ApplyModifier)
  })

  it('getPlayerId returns the player id', () => {
    expect(makeReaction().getPlayerId()).toBe('p1')
  })

  it('canExecute returns false when no modifier frame is open', () => {
    expect(makeReaction().canExecute(gs)).toBe(false)
  })

  it('canExecute returns false when card not in player hand', () => {
    gs.getPlayer('p1')!.removeFromHand(MOD)
    openFrame(gs, makeStubWindow())
    expect(makeReaction().canExecute(gs)).toBe(false)
  })

  it('canExecute returns true when frame is open and card is in hand', () => {
    openFrame(gs, makeStubWindow())
    expect(makeReaction().canExecute(gs)).toBe(true)
  })

  describe('execute', () => {
    let stub: ReturnType<typeof makeStubWindow>
    let frameId: string

    beforeEach(() => {
      stub = makeStubWindow()
      frameId = openFrame(gs, stub)
    })

    it('takes the card out of hand', () => {
      makeReaction().execute(gs, em)
      expect(gs.getPlayer('p1')!.getHand()).not.toContain(MOD)
    })

    it('puts it in the INSTANCE pile, not the discard — it is a card in play', () => {
      makeReaction().execute(gs, em)
      // On the table for as long as the roll is: the table can see it, and
      // abilitySources can find its entry there.
      expect(gs.getParty('p1').getInstanceCardIds()).toContain(MOD)
      expect(gs.getDiscardPile().getAll()).not.toContain(MOD)
    })

    it('nothing is written down — the position IS the record', () => {
      makeReaction().execute(gs, em)

      // The card is in a pile it was not in when the frame opened, and that
      // is the whole of what says it was spent into this one.
      expect(gs.getParty('p1').getInstanceCardIds()).toContain(MOD)
      expect(
        gs.frames.get(frameId)?.snapshot.getParty('p1').getInstanceCardIds(),
      ).not.toContain(MOD)
      expect(gs.isSpentInOpenFrame(MOD)).toBe(true)
    })

    it('releasing the frame is what discards it', () => {
      makeReaction().execute(gs, em)
      gs.releaseFrame(frameId)

      expect(gs.getParty('p1').getInstanceCardIds()).not.toContain(MOD)
      expect(gs.getDiscardPile().getAll()).toContain(MOD)
    })

    it('a ROLLBACK still leaves it spent', () => {
      makeReaction().execute(gs, em)
      gs.restoreFrame(frameId)

      // The snapshot predates the burn, so it hands the card back; the frame
      // remembered what was spent into it and takes it away again.
      expect(gs.getPlayer('p1')!.getHand()).not.toContain(MOD)
      expect(gs.getDiscardPile().getAll()).toContain(MOD)
    })

    it('emits ModifierPlayed naming the card and the target', () => {
      const events = collect(em)
      makeReaction('p1').execute(gs, em)

      const played = events.filter(
        (e) => e.getType() === GameEventType.ModifierPlayed,
      )
      expect(played).toHaveLength(1)
      expect(played[0].getPlayerId()).toBe('p1')
      // No value: the card's own entry decides that. The target rides across
      // as ctxSeed, because that entry runs with a fresh context.
      expect(played[0].getPayload()).toEqual({
        cardId: MOD,
        targetPlayerId: 'p1',
        ctxSeed: { [CTX_MODIFIER_TARGET]: ['p1'] },
      })
    })

    it('does NOT submit anything to the window', () => {
      makeReaction('p2').execute(gs, em)
      // ApplyModifierTask does, once the card has chosen a value.
      expect(stub.submitReaction).not.toHaveBeenCalled()
    })

    it('keeps the window alive while the card resolves', () => {
      makeReaction().execute(gs, em)
      // The submission used to reset the timer; it now arrives a choice later.
      expect(stub.cardSpent).toHaveBeenCalled()
    })

    it('does nothing when no modifier frame is open', () => {
      gs.releaseFrame(frameId)
      expect(() => makeReaction().execute(gs, em)).not.toThrow()
      expect(gs.getPlayer('p1')!.getHand()).toContain(MOD)
    })
  })
})
