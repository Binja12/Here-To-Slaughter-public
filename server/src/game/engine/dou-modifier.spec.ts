import { DouModifier } from './dou-modifier'

describe('DouModifier', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should roll two dice on creation', () => {
    const dm = new DouModifier(5000, jest.fn())
    const rolls = dm.getRolls()
    expect(rolls[0]).toBeGreaterThanOrEqual(2)
    expect(rolls[0]).toBeLessThanOrEqual(12)
    expect(rolls[1]).toBeGreaterThanOrEqual(2)
    expect(rolls[1]).toBeLessThanOrEqual(12)
  })

  it('should getFinalRoll return challengedRoll - challengerRoll', () => {
    const dm = new DouModifier(5000, jest.fn())
    const rolls = dm.getRolls()
    expect(dm.getFinalRoll()).toBe(rolls[1] - rolls[0])
  })

  it('should applyModifier update finalRoll', () => {
    const dm = new DouModifier(5000, jest.fn())
    const before = dm.getFinalRoll()
    dm.applyModifier(3)
    expect(dm.getFinalRoll()).toBe(before + 3)
  })

  it('should applyModifier work with negative value', () => {
    const dm = new DouModifier(5000, jest.fn())
    const before = dm.getFinalRoll()
    dm.applyModifier(-2)
    expect(dm.getFinalRoll()).toBe(before - 2)
  })

  it('should fire onResolved with finalRoll after timer', () => {
    const onResolved = jest.fn()
    const dm = new DouModifier(5000, onResolved)
    jest.advanceTimersByTime(5000)
    expect(onResolved).toHaveBeenCalledWith(dm.getFinalRoll())
  })

  it('should reset timer when applyModifier called', () => {
    const onResolved = jest.fn()
    const dm = new DouModifier(5000, onResolved)
    jest.advanceTimersByTime(3000)
    dm.applyModifier(1) // reset timer at 3s
    jest.advanceTimersByTime(3000) // only 3s more — total 6s but timer reset
    expect(onResolved).not.toHaveBeenCalled()
    jest.advanceTimersByTime(2000) // now 5s since last modifier
    expect(onResolved).toHaveBeenCalled()
  })

  it('should track usedCardIds', () => {
    const dm = new DouModifier(5000, jest.fn())
    dm.addUsedCard('card-1')
    dm.addUsedCard('card-2')
    expect(dm.getUsedCardIds()).toEqual(['card-1', 'card-2'])
  })
})
