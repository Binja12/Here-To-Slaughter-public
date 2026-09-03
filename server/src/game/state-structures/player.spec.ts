import { Player } from './player'

const makePlayerData = () => ({
  id: 'player-1',
  name: 'Alex',
  hand: [],
  partyId: 'party-1',
  actionPoints: 3,
})

describe('Player', () => {
  it('should return id', () => {
    const player = new Player(makePlayerData())
    expect(player.getId()).toBe('player-1')
  })

  it('should return name', () => {
    const player = new Player(makePlayerData())
    expect(player.getName()).toBe('Alex')
  })

  it('should return party id', () => {
    const player = new Player(makePlayerData())
    expect(player.getPartyId()).toBe('party-1')
  })

  it('should return action points per turn', () => {
    const player = new Player(makePlayerData())
    expect(player.getActionPointsPerTurn()).toBe(3)
  })

  it('should return current action points', () => {
    const player = new Player(makePlayerData())
    expect(player.getActionPoints()).toBe(3)
  })

  it('should decrease action points', () => {
    const player = new Player(makePlayerData())
    player.decreaseActionPoints(1)
    expect(player.getActionPoints()).toBe(2)
  })

  it('should increase action points', () => {
    const player = new Player(makePlayerData())
    player.decreaseActionPoints(2)
    player.increaseActionPoints(1)
    expect(player.getActionPoints()).toBe(2)
  })

  it('should reset action points to per-turn max', () => {
    const player = new Player(makePlayerData())
    player.decreaseActionPoints(2)
    player.resetActionPoints()
    expect(player.getActionPoints()).toBe(3)
  })

  it('should add card to hand', () => {
    const player = new Player(makePlayerData())
    player.addToHand('card-1')
    expect(player.getHand()).toContain('card-1')
  })

  it('should remove card from hand', () => {
    const player = new Player(makePlayerData())
    player.addToHand('card-1')
    player.removeFromHand('card-1')
    expect(player.getHand()).not.toContain('card-1')
  })

  it('should return hand size', () => {
    const player = new Player(makePlayerData())
    player.addToHand('card-1')
    player.addToHand('card-2')
    expect(player.getHandSize()).toBe(2)
  })

  describe('clone() and action points', () => {
    it('carries SPENT action points, not the per-turn maximum', () => {
      const player = new Player({
        id: 'p1', name: 'p1', hand: [], partyId: 'p1-party', actionPoints: 3,
      })
      player.decreaseActionPoints(2)

      const copy = player.clone()

      // The constructor seeds current AP from data.actionPoints, which is the MAX...
      expect(copy.getActionPoints()).toBe(1)
      expect(copy.getActionPointsPerTurn()).toBe(3)
    })

    it('does not let the copy and the original share a budget', () => {
      const player = new Player({
        id: 'p1', name: 'p1', hand: [], partyId: 'p1-party', actionPoints: 3,
      })
      const copy = player.clone()

      copy.decreaseActionPoints(3)

      expect(player.getActionPoints()).toBe(3)
      expect(copy.getActionPoints()).toBe(0)
    })
  })
})
