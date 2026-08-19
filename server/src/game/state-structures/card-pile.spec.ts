import { CardPile } from './card-pile'
describe('CardPile', () => {
  it('should get the pile id', () => {
    const cp = new CardPile('pile-1', 'hand-pile')
    expect(cp.getId()).toBe('pile-1')
  })
  it('should get the pile name', () => {
    const cp = new CardPile('pile-1', 'hand-pile')
    expect(cp.getName()).toBe('hand-pile')
  })
  it('should add a card', () => {
    const cp = new CardPile('pile-1', 'hand-pile')
    expect(cp.getSize()).toBe(0)
    cp.add('1st-card')
    expect(cp.getSize()).toBe(1)
  })
  it('should pick a specific card', () => {
    const cp = new CardPile('pile-1', 'hand-pile')
    cp.add('1st-card')
    cp.add('2nd-card')
    cp.add('3rd-card')
    expect(cp.pick('2nd-card')).toBe('2nd-card')
    expect(cp.getSize()).toBe(2)
  })
  it('should pick a random card', () => {
    const cp = new CardPile('pile-1', 'hand-pile')
    cp.add('1st-card')
    cp.add('2nd-card')
    cp.add('3rd-card')
    expect(cp.pick()).not.toBeNull()
    expect(cp.getSize()).toBe(2)
  })
  it('should return empty deck(null)', () => {
    const cp = new CardPile('pile-1', 'hand-pile')
    expect(cp.pick('2nd-card')).toBe(null)
  })
  it('should get all cards', () => {
    const cp = new CardPile('pile-1', 'hand-pile')
    cp.add('1st-card')
    cp.add('2nd-card')
    cp.add('3rd-card')
    expect(cp.getAll()).toEqual(
      expect.arrayContaining(['1st-card', '2nd-card', '3rd-card']),
    )
    expect(cp.getSize()).toBe(3)
  })
})
