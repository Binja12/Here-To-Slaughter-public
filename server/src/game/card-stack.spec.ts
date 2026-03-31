import { CardStack } from './card-stack'

describe('CardStack', () => {
  it('should return the deck id', () => {
    const cs = new CardStack('deck-1', 'main-deck')
    expect(cs.getId()).toBe('deck-1')
  })
  it('should return the deck name', () => {
    const cs = new CardStack('deck-1', 'main-deck')
    expect(cs.getName()).toBe('main-deck')
  })
  it('should add cards to the top', () => {
    const cs = new CardStack('deck-1', 'main-deck')
    cs.addToTop('bottom-card')
    cs.addToTop('top-card')
    expect(cs.draw()).toBe('top-card')
  })
  it('should add cards to the bottom', () => {
    const cs = new CardStack('deck-1', 'main-deck')
    cs.addToBottom('top-card')
    cs.addToBottom('bottom-card')
    expect(cs.draw()).toBe('top-card')
    expect(cs.draw()).toBe('bottom-card')
  })

  it('should add mixed cards (bottom and top)', () => {
    const cs = new CardStack('deck-1', 'main-deck')
    cs.addToTop('top-card')
    cs.addToBottom('bottom-card')
    expect(cs.draw()).toBe('top-card')
    expect(cs.draw()).toBe('bottom-card')

    cs.addToBottom('bottom-card')
    cs.addToTop('top-card')
    expect(cs.draw()).toBe('top-card')
    expect(cs.draw()).toBe('bottom-card')
  })
  it('should not draw (empty deck)', () => {
    const cs = new CardStack('deck-1', 'main-deck')
    expect(cs.draw()).toBe(null)
  })
  it('should not draw (everything drawn already)', () => {
    const cs = new CardStack('deck-1', 'main-deck')
    cs.addToTop('top-card')
    cs.addToBottom('bottom-card')
    expect(cs.draw()).toBe('top-card')
    expect(cs.draw()).toBe('bottom-card')
    expect(cs.draw()).toBe(null)
  })
  it('should track size correctly after adding and drawing', () => {
    const cs = new CardStack('deck-1', 'main-deck')
    expect(cs.getSize()).toBe(0)
    cs.addToTop('top-card')
    expect(cs.getSize()).toBe(1)
    cs.addToBottom('bottom-card')
    expect(cs.getSize()).toBe(2)
    expect(cs.draw()).toBe('top-card')
    expect(cs.getSize()).toBe(1)
    expect(cs.draw()).toBe('bottom-card')
    expect(cs.getSize()).toBe(0)
  })
  it('should maintain size after shuffle', () => {
    const cs = new CardStack('deck-1', 'main-deck')
    cs.addToTop('top-card')
    cs.addToTop('top-card')
    cs.addToTop('top-card')
    expect(cs.getSize()).toBe(3)
    cs.shuffle()
    expect(cs.getSize()).toBe(3)
  })
})
