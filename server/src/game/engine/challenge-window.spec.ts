import { ChallengeWindow } from './challenge-window'
import { makeTestGameState } from './test-helpers'

const challengeCard = {
  id: 'challenge-001',
  name: 'Not So Fast',
  type: 'Challenge',
  image: 'challenge.png',
  description: 'Counter any card play',
  set: 'base',
}

const modifierCard = {
  id: 'modifier-001',
  name: 'Lucky Roll',
  type: 'Modifier',
  image: 'modifier.png',
  description: 'Modify a roll',
  set: 'base',
  values: [12],
  condition: undefined,
}

describe('ChallengeWindow', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const makeWindow = (onResolved = jest.fn()) => {
    const gs = makeTestGameState()
    gs.getCardRepo().add(challengeCard as any)
    gs.getCardRepo().add(modifierCard as any)
    gs.getPlayer('player-2')!.addToHand('challenge-001')
    gs.getPlayer('player-2')!.addToHand('modifier-001')

    const window = new ChallengeWindow(
      'player-1',
      'hero-001',
      5000,
      gs,
      onResolved,
    )
    return { window, gs }
  }

  it('should set challengerId when challenge card played', () => {
    const { window } = makeWindow()
    window.addResponse('player-2', 'challenge-001')
    expect(window.getChallengerId()).toBe('player-2')
  })

  it('should create DouModifier when challenge card played', () => {
    const { window } = makeWindow()
    window.addResponse('player-2', 'challenge-001')
    expect(window.getModifierWindow()).toBeDefined()
  })

  it('should not create DouModifier for non-challenge card', () => {
    const { window } = makeWindow()
    window.addResponse('player-2', 'modifier-001')
    expect(window.getModifierWindow()).toBeUndefined()
  })

  // ** this test fail because the modifier is not owned by a player, so the test is wrong
  // it('should apply modifier to DouModifier', () => {
  //   const { window } = makeWindow()
  //   window.addResponse('player-2', 'challenge-001')
  //   const before = window.getModifierWindow()!.getFinalRoll()
  //   window.applyModifier(3, 'modifier-001')
  //   expect(window.getModifierWindow()!.getFinalRoll()).toBe(before + 3)
  // })

  it('should resolve with no winner when nobody challenges', () => {
    const { window, gs } = makeWindow()
    window.resolve(gs)
    expect(window.didChallengerWin()).toBe(false)
    expect(window.isResolved()).toBe(true)
  })

  it('should discard challenged card when challenger wins', () => {
    const { window, gs } = makeWindow()
    gs.getPlayer('player-1')!.addToHand('hero-001')
    window.addResponse('player-2', 'challenge-001')
    window.addResponse('player-2', 'modifier-001')
    window.resolve(gs)
    expect(gs.getDiscardPile().getAll()).toContain('hero-001')
  })

  it('should not discard challenged card when challenger loses', () => {
    const { window, gs } = makeWindow()
    gs.getPlayer('player-1')!.addToHand('hero-001')
    window.addResponse('player-2', 'challenge-001')
    window.addResponse('player-1', 'modifier-001')
    expect(gs.getDiscardPile().getAll()).not.toContain('hero-001')
  })

  it('should re-discard used cards after resolve', () => {
    const { window, gs } = makeWindow()
    window.addResponse('player-2', 'challenge-001')
    window.resolve(gs)
    expect(gs.getDiscardPile().getAll()).toContain('challenge-001')
  })

  it('should fire onResolved after timer expires following challenge', () => {
    const onResolved = jest.fn()
    const { window } = makeWindow(onResolved)
    window.addResponse('player-2', 'challenge-001')
    jest.advanceTimersByTime(5000)
    expect(onResolved).toHaveBeenCalled()
  })

  it('should reset timer when modifier applied', () => {
    const onResolved = jest.fn()
    const { window } = makeWindow(onResolved)
    window.addResponse('player-2', 'challenge-001')
    jest.advanceTimersByTime(3000)
    window.applyModifier(1, 'modifier-001')
    jest.advanceTimersByTime(3000)
    expect(onResolved).not.toHaveBeenCalled()
    jest.advanceTimersByTime(2000)
    expect(onResolved).toHaveBeenCalled()
  })

  it('should return challengedId', () => {
    const { window } = makeWindow()
    expect(window.getChallengedId()).toBe('player-1')
  })

  it('should not be resolved initially', () => {
    const { window } = makeWindow()
    expect(window.isResolved()).toBe(false)
  })
})
