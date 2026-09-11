import { ReactionWindowType } from 'shared'
import {
  active,
  answer,
  attack,
  fixDice,
  LOWEST,
  partyOf,
  playHero,
  see,
  settle,
  stacked,
  windowFor,
} from './play-through-helpers'

// Terratuga (monster-130) through the real doors: a roll of 7 or under fights
// back with "Sacrifice one of your heroes" — the attacker is asked which
// (seen missing on the 2026-09-04 table: the fight-back was text with no
// entry).
describe('Terratuga fights back over the doors', () => {
  afterEach(() => jest.restoreAllMocks())

  it('asks the attacker for a hero to sacrifice and takes it', async () => {
    const t = stacked({
      deck: ['hero-001', 'hero-002', 'hero-003', 'hero-004'],
      monsters: ['monster-130', 'monster-123', 'monster-135'],
    })
    const alice = active(t)
    playHero(t, alice, 'hero-001')
    const offer = await windowFor(t, alice, ReactionWindowType.TaskChoice)
    answer(t, offer, 'dismiss')
    await settle(t)

    fixDice(LOWEST)
    attack(t, alice, 'monster-130')
    const ask = await windowFor(t, alice, ReactionWindowType.CardChoice)
    expect(ask.options).toEqual(['hero-001'])
    expect(ask.detail).toMatchObject({ sourceCardId: 'monster-130' })
    expect(ask.optionCards?.map((c) => c.id)).toEqual(['hero-001'])

    expect(answer(t, ask, 'hero-001')).toEqual({ accepted: true })
    await settle(t)

    expect(partyOf(see(t, alice), alice).heroes).toEqual([])
  })
})
