import { rollDie, roll2Dice } from './roll-utils'

describe('RollUtils', () => {
  it('should roll between 1 and 6', () => {
    const result = rollDie()
    expect(result).toBeGreaterThanOrEqual(1)
    expect(result).toBeLessThanOrEqual(6)
  })

  it('should roll 2 dice between 2 and 12', () => {
    const result = roll2Dice()
    expect(result).toBeGreaterThanOrEqual(2)
    expect(result).toBeLessThanOrEqual(12)
  })
})
