import { GamePhase, ReactionWindowType } from 'shared'
import { GameState } from './game-state'
import { IReactionWindow } from '../interfaces'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { NO_CONTEXT_RESULT } from '../abilities/ability-context'
import { AbilityContext } from '../abilities/ability-context'

// ---------------------------------------------------------------------------
// What a settled board is, and what concluding puts down.
// ---------------------------------------------------------------------------

const makeGs = () =>
  new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard-pile'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

const stubWindow = (
  type: ReactionWindowType,
  onCancel: () => void = () => {},
  open = true,
): IReactionWindow => ({
  getId: () => `w-${type}`,
  getType: () => type,
  getRespondentId: () => 'p1',
  getOptions: () => [],
  isOpen: () => open,
  submitReaction: () => ({ accepted: true }) as const,
  resolve: () => {},
  cancel: onCancel,
  capClock: () => {},
  resultKey: () => NO_CONTEXT_RESULT,
  getDetail: () => ({}),
  getDeadline: () => 0,
})

describe('GameState.hasPendingOutcome', () => {
  it.each([
    ReactionWindowType.Challenge,
    ReactionWindowType.Modifier,
    ReactionWindowType.Attack,
  ])('is true under an open %s — its frame may still be restored', (type) => {
    const gs = makeGs()
    gs.addFrame('f1', gs.clone(), [stubWindow(type)])
    expect(gs.hasPendingOutcome()).toBe(true)
  })

  it.each([
    ReactionWindowType.TaskChoice,
    ReactionWindowType.CardChoice,
    ReactionWindowType.PlayerChoice,
    ReactionWindowType.MonsterChoice,
    ReactionWindowType.ValueChoice,
  ])('is false under an open %s — a question never restores anything', (type) => {
    const gs = makeGs()
    gs.addFrame('f1', gs.clone(), [stubWindow(type)])
    expect(gs.hasPendingOutcome()).toBe(false)
    expect(gs.isBusy()).toBe(true)
  })

  it('is true while a frame has nothing open — being built, or closed but not yet settled', () => {
    const gs = makeGs()
    gs.addFrame('f1', gs.clone(), [])
    expect(gs.hasPendingOutcome()).toBe(true)

    gs.releaseFrame('f1')
    gs.addFrame('f2', gs.clone(), [stubWindow(ReactionWindowType.TaskChoice, () => {}, false)])
    expect(gs.hasPendingOutcome()).toBe(true)

    gs.releaseFrame('f2')
    expect(gs.hasPendingOutcome()).toBe(false)
  })
})

describe('GameState.conclude', () => {
  it('closes every open window without an answer and drops the frames and the pipelines', () => {
    const gs = makeGs()
    const cancelled: string[] = []
    gs.addFrame('offer', gs.clone(), [stubWindow(ReactionWindowType.TaskChoice, () => cancelled.push('offer'))])
    gs.addFrame('done', gs.clone(), [stubWindow(ReactionWindowType.Challenge, () => cancelled.push('done'), false)])
    gs.pushPipeline({
      steps: [],
      stepIndex: 0,
      ctx: new AbilityContext('hero-1', 'p1'),
      pausedOn: 'offer',
    } as never)

    gs.conclude('p1')

    expect(gs.getGamePhase()).toBe(GamePhase.Concluded)
    expect(gs.getWinnerId()).toBe('p1')
    // Only the OPEN one is told; a closed window has nothing to cancel.
    expect(cancelled).toEqual(['offer'])
    expect(gs.getFrames().size).toBe(0)
    expect(gs.getPipelines()).toEqual([])
    expect(gs.isBusy()).toBe(false)
  })
})
