import { Player } from './player'

const makePlayerData = () => ({
  id: 'player-1',
  name: 'Alex',
  hand: [],
  partyId: 'party-1',
  actionPointsPerTurn: 3,
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
