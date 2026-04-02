import { ReactionManager } from './reaction-manager'
import { makeTestGameState } from './test-helpers'
import { ChallengeWindow } from './challenge-window'
import { ModifierWindow } from './modifier-window'

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
  values: [2],
}

describe('ReactionManager', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const makeManager = () => {
    const gs = makeTestGameState()
    gs.getCardRepo().add(challengeCard as any)
    gs.getCardRepo().add(modifierCard as any)
    gs.getPlayer('player-2')!.addToHand('challenge-001')
    gs.getPlayer('player-2')!.addToHand('modifier-001')
    const rm = new ReactionManager(gs)
    return { rm, gs }
  }

  const makeChallengeWindow = (gs: any) =>
    new ChallengeWindow('player-1', 'hero-001', 5000, gs, jest.fn())

  const makeModifierWindow = () =>
    new ModifierWindow('player-1', 5000, jest.fn())

  // ── setChallengeWindow ──────────────────────────────────────

  it('should set challenge window', () => {
    const { rm, gs } = makeManager()
    rm.setChallengeWindow(makeChallengeWindow(gs))
    expect(rm.getChallengeWindow()).toBeDefined()
  })

  it('should set modifier window', () => {
    const { rm } = makeManager()
    rm.setModifierWindow(makeModifierWindow())
    expect(rm.getModifierWindow()).toBeDefined()
  })

  // ── handleReaction ──────────────────────────────────────────

  it('should route challenge card to challengeWindow', () => {
    const { rm, gs } = makeManager()
    const window = makeChallengeWindow(gs)
    rm.setChallengeWindow(window)
    rm.handleReaction('player-2', 'challenge-001')
    expect(window.getChallengerId()).toBe('player-2')
  })

  it('should route modifier card to challengeWindow when challenge open', () => {
    const { rm, gs } = makeManager()
    const window = makeChallengeWindow(gs)
    rm.setChallengeWindow(window)
    window.addResponse('player-2', 'challenge-001')
    const before = window.getModifierWindow()!.getFinalRoll()
    rm.handleReaction('player-2', 'modifier-001', 0)
    expect(window.getModifierWindow()!.getFinalRoll()).toBe(before + 2)
  })

  it('should route modifier card to modifierWindow when no challenge', () => {
    const { rm } = makeManager()
    const modWindow = makeModifierWindow()
    rm.setModifierWindow(modWindow)
    const before = modWindow.getFinalRoll()
    rm.handleReaction('player-2', 'modifier-001', 0)
    expect(modWindow.getFinalRoll()).toBe(before + 2)
  })

  it('should ignore unknown card', () => {
    const { rm } = makeManager()
    expect(() => rm.handleReaction('player-2', 'unknown-card')).not.toThrow()
  })

  // ── hasOpenWindow ───────────────────────────────────────────

  it('should return true when challenge window open', () => {
    const { rm, gs } = makeManager()
    rm.setChallengeWindow(makeChallengeWindow(gs))
    expect(rm.hasOpenWindow()).toBe(true)
  })

  it('should return true when modifier window open', () => {
    const { rm } = makeManager()
    rm.setModifierWindow(makeModifierWindow())
    expect(rm.hasOpenWindow()).toBe(true)
  })

  it('should return false when no windows', () => {
    const { rm } = makeManager()
    expect(rm.hasOpenWindow()).toBe(false)
  })

  // ── clear ───────────────────────────────────────────────────

  it('should clear challenge window', () => {
    const { rm, gs } = makeManager()
    rm.setChallengeWindow(makeChallengeWindow(gs))
    rm.clearChallengeWindow()
    expect(rm.getChallengeWindow()).toBeUndefined()
  })

  it('should clear modifier window', () => {
    const { rm } = makeManager()
    rm.setModifierWindow(makeModifierWindow())
    rm.clearModifierWindow()
    expect(rm.getModifierWindow()).toBeUndefined()
  })
})
