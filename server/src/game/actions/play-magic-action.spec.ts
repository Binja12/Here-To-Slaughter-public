import {
  ActionType,
  CardType,
  GameEventType,
  IGameEvent,
  ReactionWindowType,
  TriggerScope,
} from 'shared'
import { PlayMagicAction } from './play-magic-action'
import { GameState } from '../pipelines/game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { ReactionManager } from '../pipelines/reaction-manager'
import { MagicCard } from '../cards/magic-card'
import { TaskManager } from '../pipelines/task-manager'
import { IAbilityRule } from '../interfaces'

// --- Helpers ---

const makePlayer = (id: string, hand: string[] = [], ap = 3) =>
  new Player({
    id,
    name: `Player ${id}`,
    hand,
    partyId: `party-${id}`,
    actionPoints: ap,
  })

const makeParty = (playerId: string) =>
  new Party({
    playerId,
    leaderId: `leader-${playerId}`,
    heroIds: [],
    monsterIds: [],
  })

const makeMagicCard = (id: string) =>
  new MagicCard({
    id,
    name: `Magic ${id}`,
    type: CardType.Magic,
    image: '',
    description: '',
    set: '',
  })

/**
 * How a magic card is authored: behaviour bound by card id, triggered by the
 * settled play, disposing of itself last.
 */
const magicAbility = (steps: IAbilityRule['steps']): IAbilityRule => ({
  trigger: {
    on: GameEventType.FrameResolved,
    scope: TriggerScope.SelfCard,
  },
  steps: [...steps],
})

/** A card that does nothing but still has to say where it goes. */
const disposeOnly = (): IAbilityRule[] => [magicAbility([])]

const spyAbility = (taskSpy: jest.Mock): IAbilityRule[] => [
  magicAbility([{ execute: () => taskSpy() }]),
]

const makeGs = () => {
  const deck = new CardStack('deck-1', 'main-deck')
  const discardPile = new CardPile('discard pile', 'discard pile')
  const monsterDeck = new CardStack('monster deck', 'main monster deck')
  const monsterPile = new CardPile('slayable monsters', 'monster pile')
  return new GameState(deck, discardPile, monsterDeck, monsterPile)
}

const openChallenge = (gs: GameState) =>
  [...gs.frames.values()]
    .flatMap((f) => f.windows)
    .find((w) => w.getType() === ReactionWindowType.Challenge && w.isOpen())

// Math.random mock guide — see challenge-window.spec.ts. The challenger's roll
// is drawn first, the defender's second; 0 gives 1, 0.99 gives 11.
const CHALLENGER_WINS: [number, number] = [0.99, 0]
const DEFENDER_WINS: [number, number] = [0, 0.99]

// --- Tests ---

describe('PlayMagicAction', () => {
  let emitter: GameEventEmitter
  let gs: GameState
  let player: Player

  beforeEach(() => {
    jest.useFakeTimers()
    emitter = new GameEventEmitter()
    gs = makeGs()
    player = makePlayer('p1', ['magic-1'])
    gs.registerPlayer(player)
    gs.registerParty(makeParty('p1'))
    gs.registerPlayer(makePlayer('p2'))
    gs.registerParty(makeParty('p2'))
    gs.setCurrentPlayerId('p1')
    gs.registerCard(makeMagicCard('magic-1'))
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  const makeAction = () => {
    const rm = new ReactionManager(gs, emitter)
    return new PlayMagicAction('a1', 'p1', 'magic-1', rm, emitter)
  }

  /**
   * A processor must be listening: the played card's steps are what carry it
   * to the discard, and only TaskManager runs those. Defaults to the minimum
   * a magic card must declare.
   */
  const withTaskManager = (
    abilities: Map<string, IAbilityRule[]> = new Map([['magic-1', disposeOnly()]]),
  ) => new TaskManager(gs, emitter, new ReactionManager(gs, emitter), abilities)

  const collect = () => {
    const emitted: IGameEvent[] = []
    emitter.addListener({ onEvent: (e) => emitted.push(e) })
    return emitted
  }

  /** Nobody spends a challenge card: the window times out uncontested. */
  const unchallenged = () => jest.advanceTimersByTime(5000)

  const challengedBy = (rolls: [number, number]) => {
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(rolls[0])
      .mockReturnValueOnce(rolls[1])
    openChallenge(gs)!.submitReaction('p2', {
      type: 'challenge',
      challengerId: 'p2',
    })
    jest.advanceTimersByTime(5000)
  }

  // --- Metadata ---

  describe('metadata', () => {
    it('getId returns the action id', () => {
      expect(makeAction().getId()).toBe('a1')
    })

    it('getType returns ActionType.PlayMagic', () => {
      expect(makeAction().getType()).toBe(ActionType.PlayMagic)
    })

    it('getPlayerId returns the player id', () => {
      expect(makeAction().getPlayerId()).toBe('p1')
    })

    it('getCost returns 1', () => {
      expect(makeAction().getCost()).toBe(1)
    })

    it('is reactable — the play opens a challenge window', () => {
      expect(makeAction().isReactable()).toBe(true)
    })
  })

  // --- canExecute ---

  describe('canExecute', () => {
    it('returns false when player does not exist', () => {
      const emptyGs = makeGs()
      emptyGs.setCurrentPlayerId('p1')
      const rm = new ReactionManager(emptyGs, emitter)
      const action = new PlayMagicAction('a1', 'p1', 'magic-1', rm, emitter)
      expect(action.canExecute(emptyGs)).toBe(false)
    })

    it('returns false when player is not the current player', () => {
      gs.setCurrentPlayerId('p2')
      expect(makeAction().canExecute(gs)).toBe(false)
    })

    it('returns false when player has insufficient action points', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', ['magic-1'], 0))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      const rm = new ReactionManager(gs2, emitter)
      const action = new PlayMagicAction('a1', 'p1', 'magic-1', rm, emitter)
      expect(action.canExecute(gs2)).toBe(false)
    })

    it('returns false when card is not in player hand', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', []))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      const rm = new ReactionManager(gs2, emitter)
      const action = new PlayMagicAction('a1', 'p1', 'magic-1', rm, emitter)
      expect(action.canExecute(gs2)).toBe(false)
    })

    it('returns true when all conditions are met', () => {
      expect(makeAction().canExecute(gs)).toBe(true)
    })
  })

  // --- execute: the price and the hand, before the snapshot ---

  describe('execute', () => {
    it('decreases action points by 1', () => {
      withTaskManager()
      makeAction().execute(gs)
      expect(gs.getPlayer('p1')!.getActionPoints()).toBe(2)
    })

    it('removes card from hand', () => {
      withTaskManager()
      makeAction().execute(gs)
      expect(gs.getPlayer('p1')!.getHand()).not.toContain('magic-1')
    })

    it('opens a challenge window naming the card', () => {
      withTaskManager()
      makeAction().execute(gs)
      const window = openChallenge(gs)
      expect(window).toBeDefined()
      expect((window as unknown as { getCardId(): string }).getCardId()).toBe(
        'magic-1',
      )
    })

    it('announces the play from the instance pile, then waits on the window', () => {
      const spy = jest.fn()
      withTaskManager(new Map([['magic-1', spyAbility(spy)]]))
      const emitted = collect()

      makeAction().execute(gs)

      expect(gs.getParty('p1').getInstanceCardIds()).toContain('magic-1')
      expect(emitted.map((e) => e.getType())).toContain(
        GameEventType.MagicPlayed,
      )
      // MagicPlayed is the attempt; the card's own steps wait for the outcome.
      expect(spy).not.toHaveBeenCalled()
      expect(gs.getDiscardPile().getAll()).not.toContain('magic-1')
    })
  })

  // --- The card survives ---

  describe('when the play survives the challenge', () => {
    it('card ends up in discard pile after resolve', () => {
      withTaskManager()
      makeAction().execute(gs)
      unchallenged()
      expect(gs.getDiscardPile().getAll()).toContain('magic-1')
    })

    it('card is not in instance pile after resolve', () => {
      withTaskManager()
      makeAction().execute(gs)
      unchallenged()
      expect(gs.getParty('p1').getInstanceCardIds()).not.toContain('magic-1')
    })

    it('emits MagicPlayed event with cardId in payload', () => {
      withTaskManager()
      const emitted = collect()

      makeAction().execute(gs)
      unchallenged()

      const magicPlayed = emitted.find(
        (e) => e.getType() === GameEventType.MagicPlayed,
      )
      expect(magicPlayed).toBeDefined()
      expect((magicPlayed!.getPayload() as { cardId: string }).cardId).toBe(
        'magic-1',
      )
    })

    it('announces nothing for the discard — MagicPlayed already said it', () => {
      withTaskManager()
      const emitted = collect()

      makeAction().execute(gs)
      unchallenged()

      expect(
        emitted.some((e) => e.getType() === GameEventType.CardDiscarded),
      ).toBe(false)
    })

    it('executes the magic card ability tasks via TaskManager', () => {
      const taskSpy = jest.fn()
      withTaskManager(new Map([['magic-1', spyAbility(taskSpy)]]))

      makeAction().execute(gs)
      unchallenged()

      expect(taskSpy).toHaveBeenCalledTimes(1)
    })

    it('card is in instance pile when MagicPlayed fires', () => {
      let inInstanceAtEmit = false
      emitter.addListener({
        onEvent: (e) => {
          if (e.getType() === GameEventType.MagicPlayed) {
            inInstanceAtEmit = gs
              .getParty('p1')
              .getInstanceCardIds()
              .includes('magic-1')
          }
        },
      })
      withTaskManager()

      makeAction().execute(gs)
      unchallenged()

      expect(inInstanceAtEmit).toBe(true)
    })

    it('a challenge it wins plays the card and marks it unchallengeable', () => {
      const taskSpy = jest.fn()
      withTaskManager(new Map([['magic-1', spyAbility(taskSpy)]]))

      makeAction().execute(gs)
      challengedBy(DEFENDER_WINS)

      expect(taskSpy).toHaveBeenCalledTimes(1)
      expect(gs.getDiscardPile().getAll()).toContain('magic-1')
      expect(gs.getCardsChallengedThisTurn()).toContain('magic-1')
    })
  })

  // --- The card is defeated ---

  describe('when the challenger wins', () => {
    it('discards the card and runs none of its steps', () => {
      const taskSpy = jest.fn()
      withTaskManager(new Map([['magic-1', spyAbility(taskSpy)]]))

      makeAction().execute(gs)
      challengedBy(CHALLENGER_WINS)

      // Rolled back out of the instance pile, so it is not a source when
      // the settled frame is matched.
      expect(taskSpy).not.toHaveBeenCalled()
      expect(gs.getParty('p1').getInstanceCardIds()).not.toContain('magic-1')
      expect(gs.getDiscardPile().getAll()).toContain('magic-1')
    })

    it('keeps the card out of hand and the point spent', () => {
      // Both happened before the snapshot: a challenged card is spent either
      // way, and so is the action point that played it.
      withTaskManager()

      makeAction().execute(gs)
      challengedBy(CHALLENGER_WINS)

      expect(gs.getPlayer('p1')!.getHand()).not.toContain('magic-1')
      expect(gs.getPlayer('p1')!.getActionPoints()).toBe(2)
    })

    it('leaves nothing pending', () => {
      withTaskManager()

      makeAction().execute(gs)
      challengedBy(CHALLENGER_WINS)

      expect(gs.abilityPipelines).toHaveLength(0)
      expect(gs.frames.size).toBe(0)
    })
  })
})
