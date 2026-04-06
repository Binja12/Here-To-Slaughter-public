import { Player } from './player'

const makePlayerData = () => ({
  id: 'player-1',
  name: 'Benjamin',
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
    expect(player.getName()).toBe('Benjamin')
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
})
