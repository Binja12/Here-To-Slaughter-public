import { roll2Dice, rollDie } from './roll-utils'

afterEach(() => jest.restoreAllMocks())

it('maps each sixth of the random range to one die face, including the endpoints', () => {
  const random = jest.spyOn(Math, 'random')
  for (let face = 1; face <= 6; face++) {
    random.mockReturnValue((face - 1) / 6)
    expect(rollDie()).toBe(face)
    random.mockReturnValue(face / 6 - Number.EPSILON)
    expect(rollDie()).toBe(face)
  }
})

it('has the exact 2d6 distribution across all 36 equally likely pairs', () => {
  const random = jest.spyOn(Math, 'random')
  const totals = Array(13).fill(0)
  for (let first = 1; first <= 6; first++) {
    for (let second = 1; second <= 6; second++) {
      random.mockReturnValueOnce((first - 0.5) / 6).mockReturnValueOnce((second - 0.5) / 6)
      totals[roll2Dice()]++
    }
  }
  expect(totals).toEqual([0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1])
  expect(random).toHaveBeenCalledTimes(72)
})
