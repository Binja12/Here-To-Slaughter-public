import { ReactionWindowType } from 'shared'
import {
  active,
  answer,
  endTurn,
  partyOf,
  playHero,
  playItem,
  playMagic,
  see,
  settle,
  stacked,
  windowFor,
} from './play-through-helpers'

// Winds of Change through the real doors: a cursed item an opponent put on
// the caster's hero comes back to the CASTER's hand - the player whose hero
// wore it (doubted on the 2026-09-04 table; the engine is right).
describe('Winds of Change on a curse', () => {
  afterEach(() => jest.restoreAllMocks())

  it('returns the curse to the hand of the player whose hero wore it', async () => {
    const t = stacked({
      // alice: hero + Winds; bob: curse + filler
      deck: ['hero-044', 'magic-058', 'item-074', 'hero-001'],
    })
    const alice = active(t)
    playHero(t, alice, 'hero-044')
    await settle(t)
    await endTurn(t)
    const bob = active(t)
    playItem(t, bob, 'item-074', 'hero-044')
    await settle(t)
    expect(partyOf(see(t, alice), alice).heroes[0].equippedItem?.id).toBe('item-074')
    await endTurn(t)
    expect(active(t)).toBe(alice)

    playMagic(t, alice, 'magic-058')
    const pick = await windowFor(t, alice, ReactionWindowType.CardChoice)
    expect(pick.options).toEqual(['item-074'])
    expect(answer(t, pick, 'item-074')).toEqual({ accepted: true })
    await settle(t)

    const view = see(t, alice)
    expect(partyOf(view, alice).heroes[0].equippedItem).toBeUndefined()
    expect(view.hand.map((c) => c.id)).toContain('item-074')
  })
})
