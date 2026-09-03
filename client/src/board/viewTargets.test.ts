import { midGame } from '../fixtures/views'
import {
  discardCardsForView,
  idForTargetKey,
  targetKeyForId,
} from './viewTargets'

describe('visible reaction targets', () => {
  test('presents active instance cards on top of the discard pile', () => {
    const cards = discardCardsForView(midGame)

    expect(cards.slice(0, 3).map((card) => card.id)).toEqual([
      'magic-058',
      'magic-061',
      'magic-053',
    ])
    expect(targetKeyForId(midGame, 'magic-058')).toBe('discardCard:0')
    expect(idForTargetKey(midGame, 'discardCard:0')).toBe('magic-058')
  })

  test('gives an equipped item its own target instead of its hero target', () => {
    expect(targetKeyForId(midGame, 'item-064')).toBe('item:p1:0')
    expect(idForTargetKey(midGame, 'item:p1:0')).toBe('item-064')
  })
})
