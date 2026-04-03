import {
  HeroRollResolver,
  MonsterRollResolver,
  ChallengeRollResolver,
} from './roll-resolvers'
import { RollCompareMode, RollResult } from 'shared'
describe('roll-resolver', () => {
  // hero resolvers
  const hResolver = new HeroRollResolver(6)
  it('should return sucssus', () => {
    expect(hResolver.resolve(7)).toBe(RollResult.Success)
  })
  it('should return failure', () => {
    expect(hResolver.resolve(5)).toBe(RollResult.Failure)
  })
  it('should return Success', () => {
    expect(hResolver.resolve(6)).toBe(RollResult.Success)
  })

  // monster resolvers
  const mResolverWin = new MonsterRollResolver(3, 6)
  it('should slay when roll above higherReq', () => {
    expect(mResolverWin.resolve(7)).toBe(RollResult.Slay)
  })
  it('should miss when roll between', () => {
    expect(mResolverWin.resolve(5)).toBe(RollResult.Miss)
  })
  it('should fightback when roll below lowerReq', () => {
    expect(mResolverWin.resolve(2)).toBe(RollResult.FightBack)
  })
  const mResolverLose = new MonsterRollResolver(
    10,
    12,
    RollCompareMode.LowToWin,
  )
  it('should FightBack when roll above higherReq', () => {
    expect(mResolverLose.resolve(14)).toBe(RollResult.FightBack)
  })
  it('should miss when roll between', () => {
    expect(mResolverLose.resolve(11)).toBe(RollResult.Miss)
  })
  it('should Slay when roll below higherReq', () => {
    expect(mResolverLose.resolve(6)).toBe(RollResult.Slay)
  })

  // challenge resolvers
  const cResolver = new ChallengeRollResolver(2)
  it('should return ChallengerWins', () => {
    expect(cResolver.resolve(1)).toBe(RollResult.ChallengerWins)
  })
  it('should return ChallengerWins on tie', () => {
    expect(cResolver.resolve(2)).toBe(RollResult.ChallengerWins)
  })
  it('should return ChallengerLoses', () => {
    expect(cResolver.resolve(6)).toBe(RollResult.ChallengerLoses)
  })
})
