import { CardType, GameEventType, RefusalReason } from 'shared'
import type { ModifierCardData } from 'shared'
import { baseGameCards } from '../../data/base-game-cards'
import { PlayChallengeReaction } from '../reactions/play-challenge-reaction'
import { PlayModifierReaction } from '../reactions/play-modifier-reaction'
import {
  COUNTDOWN_MS,
  MIDDLING,
  actionId,
  active,
  answer,
  attack,
  board,
  draw,
  fixDice,
  inDiscard,
  ofType,
  partyOf,
  pass,
  playHero,
  react,
  rollOnHero,
  scriptDice,
  seatOf,
  see,
  settle,
  stacked,
  until,
} from './play-through-helpers'

// ---------------------------------------------------------------------------
// Seamless reactions (docs/SEAMLESS_REACTIONS_PLAN.md) on a dealt table,
// through the player doors only. Every table here is `seamless: true`; the
// printed game's behaviour is the rest of the suite.
// ---------------------------------------------------------------------------

const CHALLENGE = 'challenge-102'
const WILDSHOT = 'hero-012' // DRAW 3 cards and DISCARD a card, rollReq 8
const modifierWorth = (value: number) =>
  (baseGameCards.find(
    (card) => card.type === CardType.Modifier && (card as ModifierCardData).values.join() === String(value),
  ) as ModifierCardData).id
const MINUS_4 = modifierWorth(-4)
const PLUS_4 = modifierWorth(4)

const windows = (t: ReturnType<typeof stacked>, type: string) =>
  board(t).pendingWindows.filter((w) => w.type === type)

describe('seamless reactions', () => {
  afterEach(() => jest.restoreAllMocks())

  it('lets the active player play on under an open window, and both plays stand when nobody reacts', async () => {
    const t = stacked({ deck: ['hero-001', 'hero-002', 'hero-003', 'hero-004'], seamless: true })
    const alice = active(t)

    expect(playHero(t, alice, 'hero-001')).toEqual({ accepted: true })
    expect(windows(t, 'Challenge')).toHaveLength(1)
    expect(see(t, alice).acceptsActions).toBe(true)

    expect(playHero(t, alice, 'hero-002')).toEqual({ accepted: true })
    expect(windows(t, 'Challenge')).toHaveLength(2)
    // Both stand already: the board shows a play the moment it is made.
    expect(partyOf(board(t), alice).heroes.map((h) => h.card.id)).toEqual(['hero-001', 'hero-002'])

    await settle(t)
    expect(partyOf(board(t), alice).heroes.map((h) => h.card.id)).toEqual(['hero-001', 'hero-002'])
    expect(seatOf(board(t), alice).actionPoints).toBe(1)
    expect(active(t)).toBe(alice)
  })

  it('a lost challenge undoes the play and everything played since, and cancels the later window', async () => {
    const t = stacked({ deck: ['hero-001', 'hero-002', CHALLENGE, 'hero-003'], seamless: true })
    const alice = active(t)
    const bob = board(t).seats.find((s) => s.playerId !== alice)!.playerId

    playHero(t, alice, 'hero-001')
    playHero(t, alice, 'hero-002')
    expect(seatOf(board(t), alice).actionPoints).toBe(1)

    // Challenger rolls 11, the defender 1.
    scriptDice([0.99, 0], MIDDLING)
    expect(
      react(t, new PlayChallengeReaction(actionId(), bob, CHALLENGE, 'hero-001')),
    ).toEqual({ accepted: true })
    const contest = windows(t, 'Challenge').find((w) => w.detail?.['challenged'] === true)!
    expect(contest).toBeDefined()
    // A contest running is a reaction being resolved: the active player waits.
    expect(see(t, alice).acceptsActions).toBe(false)
    expect(draw(t, alice)).toEqual({ accepted: false, reason: RefusalReason.Busy })

    // Both contestants give the contest up: it settles now.
    t.game.reactionManager.pass(contest.windowId, alice)
    t.game.reactionManager.pass(contest.windowId, bob)

    const after = board(t)
    expect(partyOf(after, alice).heroes).toEqual([])
    expect(inDiscard(after, 'hero-001')).toBe(true)
    expect(inDiscard(after, CHALLENGE)).toBe(true)
    // The second play never happened: card back, point back, window gone.
    expect(see(t, alice).hand.map((c) => c.id)).toEqual(['hero-002'])
    expect(seatOf(after, alice).actionPoints).toBe(2)
    expect(after.pendingWindows).toEqual([])
    expect(after.busy).toBe(false)
    const cancelled = ofType(t, GameEventType.ReactionWindowClosed).filter(
      (e) => (e.getPayload() as { cancelled?: boolean }).cancelled === true,
    )
    expect(cancelled).toHaveLength(1)

    // And play goes on from the same spot.
    expect(playHero(t, alice, 'hero-002')).toEqual({ accepted: true })
    await settle(t)
    expect(partyOf(board(t), alice).heroes.map((h) => h.card.id)).toEqual(['hero-002'])
  })

  it('a modifier that flips a roll undoes its effect and the question it opened; a counter puts them back', async () => {
    const t = stacked({
      deck: [WILDSHOT, PLUS_4, MINUS_4, 'hero-003'],
      slack: 12,
      seamless: true,
    })
    const alice = active(t)
    const bob = board(t).seats.find((s) => s.playerId !== alice)!.playerId

    playHero(t, alice, WILDSHOT)
    await until(() => windows(t, 'TaskChoice').length === 1, 'the roll offer')
    // A roll of 8 against a requirement of 8: a success standing.
    fixDice(MIDDLING)
    expect(rollOnHero(t, alice, WILDSHOT)).toEqual({ accepted: true })
    await until(() => windows(t, 'CardChoice').length === 1, "Wildshot's discard question")
    // Applied at once: three drawn, one to discard, the roll still open.
    expect(see(t, alice).hand).toHaveLength(4)
    expect(windows(t, 'Modifier')).toHaveLength(1)
    // A question of the active player's own blocks them.
    expect(see(t, alice).acceptsActions).toBe(false)

    expect(
      react(t, new PlayModifierReaction(actionId(), bob, MINUS_4, alice, -4)),
    ).toEqual({ accepted: true })

    // 4 against 8: undone — the cards back on the deck, the question gone,
    // the roll still open for a counter.
    expect(see(t, alice).hand).toHaveLength(1)
    expect(windows(t, 'CardChoice')).toEqual([])
    expect(windows(t, 'Modifier')).toHaveLength(1)
    expect(see(t, alice).acceptsActions).toBe(true)
    expect(inDiscard(board(t), MINUS_4)).toBe(true)

    // The roller counters on her own roll: 8 again, and everything again.
    expect(
      react(t, new PlayModifierReaction(actionId(), alice, PLUS_4, alice, 4)),
    ).toEqual({ accepted: true })
    await until(() => windows(t, 'CardChoice').length === 1, 'the question, asked again')
    expect(see(t, alice).hand).toHaveLength(3) // +3 drawn, the +4 spent
    const question = windows(t, 'CardChoice')[0]
    expect(answer(t, question, question.options![0])).toEqual({ accepted: true })
    expect(see(t, alice).hand).toHaveLength(2)

    // The roll lapses on what stands: nothing more changes.
    await settle(t)
    expect(see(t, alice).hand).toHaveLength(2)
    expect(windows(t, 'Modifier')).toEqual([])
    expect(inDiscard(board(t), PLUS_4)).toBe(true)
  })

  it('an attack is the one play that waits: modifiable, settled on its clock, the attacker held', async () => {
    const t = stacked({
      deck: ['hero-044', PLUS_4, 'hero-002', 'hero-003'],
      monsters: ['monster-128'],
      seamless: true,
    })
    const alice = active(t)
    playHero(t, alice, 'hero-044')
    await settle(t)

    fixDice(MIDDLING) // 8: short of the 10 it takes, in the band that misses
    expect(attack(t, alice, 'monster-128')).toEqual({ accepted: true })
    expect(windows(t, 'Attack')).toHaveLength(1)
    // Nothing happened yet, and the attacker waits with the roll.
    expect(partyOf(board(t), alice).monsters).toEqual([])
    expect(see(t, alice).acceptsActions).toBe(false)

    // The attacker may still help the roll.
    expect(
      react(t, new PlayModifierReaction(actionId(), alice, PLUS_4, alice, 4)),
    ).toEqual({ accepted: true })
    expect(partyOf(board(t), alice).monsters).toEqual([])

    await settle(t)
    // 12 against 10: slain at settlement, as ever.
    expect(partyOf(board(t), alice).monsters.map((m) => m.id)).toEqual(['monster-128'])
    expect(see(t, alice).acceptsActions).toBe(true)
  })

  it('an optional question of the active player is forfeited by their next action', async () => {
    const t = stacked({ deck: ['hero-001', 'hero-002', 'hero-003', 'hero-004'], slack: 6, seamless: true })
    const alice = active(t)

    playHero(t, alice, 'hero-001')
    await until(() => windows(t, 'TaskChoice').length === 1, 'the roll offer')
    const offer = windows(t, 'TaskChoice')[0]
    expect(offer.isYours).toBe(true)
    expect(offer.options).toContain('dismiss')
    expect(see(t, alice).acceptsActions).toBe(true)

    const before = see(t, alice).hand.length
    expect(draw(t, alice)).toEqual({ accepted: true })
    expect(see(t, alice).hand).toHaveLength(before + 1)
    expect(windows(t, 'TaskChoice')).toEqual([])
    // Forfeited, not cancelled: a dismissed offer closes as itself.
    const closed = ofType(t, GameEventType.ReactionWindowClosed).map(
      (e) => e.getPayload() as { windowType: string; cancelled?: boolean },
    )
    expect(closed.some((p) => p.windowType === 'TaskChoice' && p.cancelled !== true)).toBe(true)
    expect(closed.some((p) => p.cancelled === true)).toBe(false)
    await settle(t)
  })

  it('End Turn waits for the open windows; the next turn starts once they have settled', async () => {
    const t = stacked({ deck: ['hero-001', 'hero-002', 'hero-003', 'hero-004'], seamless: true })
    const alice = active(t)

    playHero(t, alice, 'hero-001')
    const window = windows(t, 'Challenge')[0]
    expect(pass(t, alice)).toEqual({ accepted: true })
    expect(seatOf(board(t), alice).actionPoints).toBe(0)
    expect(active(t)).toBe(alice)

    await until(() => active(t) !== alice, 'the next turn')
    expect(Date.now()).toBeGreaterThanOrEqual(window.deadline)
    expect(partyOf(board(t), alice).heroes.map((h) => h.card.id)).toEqual(['hero-001'])
    expect(ofType(t, GameEventType.TurnEnded)).toHaveLength(1)
  })

  it('the turn clock runs under an open window, and a lapsed turn ends once the windows settle', async () => {
    const turnTimeMs = Math.round(COUNTDOWN_MS / 3)
    const t = stacked({
      deck: ['hero-001', 'hero-002', 'hero-003', 'hero-004'],
      seamless: true,
      turnTimeMs,
    })
    const alice = active(t)

    playHero(t, alice, 'hero-001')
    const window = windows(t, 'Challenge')[0]
    await until(() => seatOf(board(t), alice).actionPoints === 0, 'the clock to lapse')
    // Lapsed under the window: still her turn until it settles.
    expect(active(t)).toBe(alice)
    expect(Date.now()).toBeLessThan(window.deadline)

    await until(() => active(t) !== alice, 'the next turn')
    expect(Date.now()).toBeGreaterThanOrEqual(window.deadline)
    expect(partyOf(board(t), alice).heroes.map((h) => h.card.id)).toEqual(['hero-001'])
  })
})
