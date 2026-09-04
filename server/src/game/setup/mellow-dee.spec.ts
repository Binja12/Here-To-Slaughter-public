import { ReactionWindowType } from 'shared'
import {
  active,
  answer,
  fixDice,
  HIGHEST,
  partyOf,
  playHero,
  rollOnHero,
  seatOf,
  see,
  settle,
  stacked,
  windowFor,
} from './play-through-helpers'

// Mellow Dee (hero-041) through the real doors: "DRAW a card. If that card
// is a Hero card, you may play it immediately." The question the screen
// gets is a TaskChoice whose subject is the DRAWN card, which sits in the
// hand — not in the party — and a yes plays it for free.
describe('Mellow Dee over the doors', () => {
  afterEach(() => jest.restoreAllMocks())

  it('asks about the drawn hero, names it as the subject, and a yes plays it for nothing', async () => {
    const t = stacked({
      // alice: Mellow Dee + filler; bob: two fillers; the deck's next card is a hero
      deck: ['hero-041', 'hero-001', 'hero-002', 'hero-003', 'hero-004'],
    })
    const alice = active(t)
    playHero(t, alice, 'hero-041')
    // the roll offer on the played hero (after its challenge window lapses):
    // decline it and roll on the hero as an action instead
    const offer = await windowFor(t, alice, ReactionWindowType.TaskChoice)
    answer(t, offer, 'dismiss')
    await settle(t)

    fixDice(HIGHEST)
    rollOnHero(t, alice, 'hero-041')
    const ask = await windowFor(t, alice, ReactionWindowType.TaskChoice)
    const view = see(t, alice)
    expect(view.hand.map((c) => c.id)).toContain('hero-004')
    expect(ask.options).toEqual(['confirm', 'dismiss'])
    expect(ask.detail).toMatchObject({ confirms: 'MellowDeePlaysHero', cardId: 'hero-004' })
    const pointsBefore = seatOf(view, alice).actionPoints

    expect(answer(t, ask, 'confirm')).toEqual({ accepted: true })
    await settle(t)

    const after = see(t, alice)
    expect(partyOf(after, alice).heroes.map((h) => h.card.id)).toContain('hero-004')
    expect(after.hand.map((c) => c.id)).not.toContain('hero-004')
    expect(seatOf(after, alice).actionPoints).toBe(pointsBefore)
  })
})
