import { CardType, GameEventType, HeroClass, IGameEvent } from 'shared'
import { ChallengeAbility } from './challenge-ability'
import { CloakedSageAbility } from './cloaked-sage-ability'
import { abilityRegistry } from './index'
import { GameState } from '../../pipelines/game-state'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { MagicCard } from '../../cards/magic-card'
import { ChallengeCard } from '../../cards/challenge-card'
import { PartyLeaderCard } from '../../cards/party-leader-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { PlayMagicAction } from '../../actions/play-magic-action'
import { PlayChallengeReaction } from '../../reactions/play-challenge-reaction'

// ---------------------------------------------------------------------------
// The Cloaked Sage (leader-120) — "Each time you play a Magic card, DRAW a card."
//
//   challenge roll = floor(random * 11) + 1  -> 0 => 1, 0.99 => 11
// ---------------------------------------------------------------------------

const SAGE = 'leader-120'
/** A real printed id: contesting the play is the challenge card's own entry. */
const CHAL = 'challenge-102'

const LOW = 0
const HIGH = 0.99

const makeMagic = (id: string) =>
  new MagicCard({
    id,
    name: id,
    type: CardType.Magic,
    image: '',
    description: '',
    set: 'base',
  })

const makeChallenge = (id: string) =>
  new ChallengeCard({
    id,
    name: id,
    type: CardType.Challenge,
    image: '',
    description: '',
    set: 'base',
  })

/**
 * p1 leads with the Sage; p2 leads with a leader that has no entry here, so an
 * opponent's magic play has something to be ignored by.
 */
function setup(deck: string[], p1Hand: string[], p2Hand: string[] = []) {
  const stack = new CardStack('deck', 'main')
  for (const c of deck) stack.addToBottom(c)
  const gs = new GameState(
    stack,
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

  for (const [playerId, hand, leaderId] of [
    ['p1', p1Hand, SAGE],
    ['p2', p2Hand, 'leader-116'],
  ] as const) {
    gs.registerPlayer(
      new Player({
        id: playerId,
        name: playerId,
        hand: [...hand],
        partyId: playerId + '-party',
        actionPoints: 3,
      }),
    )
    gs.registerParty(
      new Party({ playerId, leaderId, heroIds: [], monsterIds: [] }),
    )
    gs.registerCard(
      new PartyLeaderCard({
        id: leaderId,
        name: leaderId,
        type: CardType.Leader,
        image: '',
        description: '',
        set: 'base',
        heroClass: HeroClass.Wizard,
      }),
    )
  }
  gs.setCurrentPlayerId('p1')

  for (const id of [...deck, ...p1Hand, ...p2Hand]) {
    gs.registerCard(id.startsWith('challenge') ? makeChallenge(id) : makeMagic(id))
  }

  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  new TaskManager(
    gs,
    em,
    rm,
    new Map([
      [SAGE, CloakedSageAbility],
      [CHAL, ChallengeAbility],
    ]),
  )
  return { gs, em, rm, events }
}

const drawnBy = (events: IGameEvent[], playerId: string) =>
  events
    .filter(
      (e) =>
        e.getType() === GameEventType.CardDrawn && e.getPlayerId() === playerId,
    )
    .map((e) => (e.getPayload() as { cardId: string }).cardId)

describe('CloakedSageAbility', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('is registered against the leader card id', () => {
    expect(abilityRegistry.get(SAGE)).toBe(CloakedSageAbility)
  })

  it('is one entry, on the ATTEMPT — a leader can be reached no other way', () => {
    // FrameResolved is what a played card's own steps hang off, but it carries
    // no playerId, so OwnerEvent cannot match it, and its cardId names the
    // magic card rather than this leader.
    expect(CloakedSageAbility).toHaveLength(1)
    expect(CloakedSageAbility[0].trigger.on).toBe(GameEventType.MagicPlayed)
  })

  it('draws a card when its owner plays a Magic card', () => {
    const { gs, em, rm, events } = setup(['top'], ['magic-1'])
    new PlayMagicAction('a1', 'p1', 'magic-1', rm, em).execute(gs)
    jest.advanceTimersByTime(5000) // nobody challenges

    expect(drawnBy(events, 'p1')).toEqual(['top'])
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['top'])
  })

  it('draws again on the next play — "each time"', () => {
    const { gs, em, rm, events } = setup(
      ['top', 'second'],
      ['magic-1', 'magic-2'],
    )
    new PlayMagicAction('a1', 'p1', 'magic-1', rm, em).execute(gs)
    jest.advanceTimersByTime(5000)
    new PlayMagicAction('a2', 'p1', 'magic-2', rm, em).execute(gs)
    jest.advanceTimersByTime(5000)

    expect(drawnBy(events, 'p1')).toEqual(['top', 'second'])
  })

  it('ignores an opponent playing a Magic card', () => {
    const { gs, em, rm, events } = setup(['top'], [], ['magic-2'])
    gs.setCurrentPlayerId('p2')
    new PlayMagicAction('a1', 'p2', 'magic-2', rm, em).execute(gs)
    jest.advanceTimersByTime(5000)

    expect(drawnBy(events, 'p1')).toEqual([])
    expect(gs.getMainDeck().getSize()).toBe(1)
  })

  it('a lost challenge takes the draw back with the play', () => {
    const { gs, em, rm } = setup(['top'], ['magic-1'], [CHAL])
    new PlayMagicAction('a1', 'p1', 'magic-1', rm, em).execute(gs)

    // The draw already happened — it runs on the attempt, inside the frame.
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['top'])

    // challenger 11, challenged 1 -> the play is defeated
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(HIGH).mockReturnValueOnce(HIGH)
      .mockReturnValueOnce(LOW).mockReturnValueOnce(LOW)
    rm.submitReaction(new PlayChallengeReaction('r1', 'p2', CHAL, 'magic-1'))
    jest.advanceTimersByTime(5000)

    expect(gs.getPlayer('p1')!.getHand()).toEqual([])
    expect(gs.getMainDeck().getSize()).toBe(1) // the drawn card went back
    expect(gs.getDiscardPile().getAll()).toContain('magic-1')
  })

  it('a survived challenge keeps the draw', () => {
    const { gs, em, rm } = setup(['top'], ['magic-1'], [CHAL])
    new PlayMagicAction('a1', 'p1', 'magic-1', rm, em).execute(gs)

    // challenger 1, challenged 11 -> the play stands
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(LOW).mockReturnValueOnce(LOW)
      .mockReturnValueOnce(HIGH).mockReturnValueOnce(HIGH)
    rm.submitReaction(new PlayChallengeReaction('r1', 'p2', CHAL, 'magic-1'))
    jest.advanceTimersByTime(5000)

    expect(gs.getPlayer('p1')!.getHand()).toEqual(['top'])
  })

  it('an empty deck draws nothing and does not throw', () => {
    const { gs, em, rm, events } = setup([], ['magic-1'])
    new PlayMagicAction('a1', 'p1', 'magic-1', rm, em).execute(gs)
    jest.advanceTimersByTime(5000)

    expect(drawnBy(events, 'p1')).toEqual([])
    expect(gs.getPlayer('p1')!.getHand()).toEqual([])
  })
})
