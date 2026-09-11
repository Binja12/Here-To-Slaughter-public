import { modifierWindowOpen, threeSeatOpening } from '../fixtures/views'
import type { PendingWindowView, PlayerView } from '../contract'
import { backedRole, lazyModifierValue, lazyMove } from './lazyChoice'

// Lazy Choice presses buttons for the player, so every rule it acts on is
// covered here rather than left to a live table.

const DEADLINE = Date.now() + 30_000

const withWindows = (
  view: PlayerView,
  windows: PendingWindowView[],
): PlayerView => ({ ...view, busy: true, pendingWindows: windows })

const valueChoice = (bias: unknown, options: unknown[] = [2, -2]): PendingWindowView => ({
  windowId: 'value',
  type: 'ValueChoice',
  respondentId: threeSeatOpening.playerId,
  options,
  detail: { bias, sourceCardId: 'card-x' },
  deadline: DEADLINE,
  isYours: true,
})

const drawOffer = (confirms: string): PendingWindowView => ({
  windowId: 'draw',
  type: 'TaskChoice',
  respondentId: threeSeatOpening.playerId,
  options: ['confirm', 'dismiss'],
  optional: true,
  detail: { confirms, sourceCardId: 'card-y' },
  deadline: DEADLINE,
  isYours: true,
})

/** The viewer's own roll, at `finalRoll` against `rollReq`, still passable. */
const myRoll = (finalRoll: number, rollReq = 9): PendingWindowView => ({
  ...modifierWindowOpen.pendingWindows[0],
  respondentId: threeSeatOpening.playerId,
  canPass: true,
  isYours: true,
  deadline: DEADLINE,
  detail: {
    ...modifierWindowOpen.pendingWindows[0].detail,
    rollerId: threeSeatOpening.playerId,
    finalRoll,
    rollReq,
    passedBy: [],
  },
})

test('a value takes the direction the engine already declared, never its own', () => {
  // `highest` for a bonus on your own roll, `lowest` for one on somebody
  // else's; in a challenge, challenger high and defender low. All of it is the
  // server's `bias`, read rather than re-derived.
  expect(lazyMove(withWindows(threeSeatOpening, [valueChoice('highest')]))).toMatchObject({
    kind: 'submit',
    windowId: 'value',
    choice: 2,
  })
  expect(lazyMove(withWindows(threeSeatOpening, [valueChoice('lowest')]))).toMatchObject({
    choice: -2,
  })
  // no bias declared falls the way the server's own default does
  expect(lazyMove(withWindows(threeSeatOpening, [valueChoice(undefined)]))).toMatchObject({
    choice: 2,
  })
  // a card printed with one value has one outcome either way
  expect(
    lazyMove(withWindows(threeSeatOpening, [valueChoice('lowest', [4])])),
  ).toMatchObject({ choice: 4 })
})

test('a "you may draw" is answered yes — the one rule silence cannot give', () => {
  for (const label of ['ArcticAriesDrawsCard', 'CrownedSerpentDraws', 'PlunderingPumaVictimDraws']) {
    expect(lazyMove(withWindows(threeSeatOpening, [drawOffer(label)]))).toMatchObject({
      kind: 'submit',
      windowId: 'draw',
      choice: 'confirm',
    })
  }
  // an optional offer that is NOT a draw is left alone
  expect(lazyMove(withWindows(threeSeatOpening, [drawOffer('PlayAnItem')]))).toBeNull()
})

test('a roll of mine that already clears its mark is skipped, and one that does not is left', () => {
  expect(lazyMove(withWindows(threeSeatOpening, [myRoll(10)]))).toMatchObject({
    kind: 'skip',
    windowId: 'window-modifier',
  })
  // short of the requirement there is still something to decide
  expect(lazyMove(withWindows(threeSeatOpening, [myRoll(8)]))).toBeNull()
})

test("an enemy's roll is skipped once it has already failed, and not before", () => {
  const theirs = (finalRoll: number): PendingWindowView => ({
    ...modifierWindowOpen.pendingWindows[0],
    canPass: true,
    deadline: DEADLINE,
    detail: { ...modifierWindowOpen.pendingWindows[0].detail, finalRoll, rollReq: 9, passedBy: [] },
  })

  // still standing: sinking it is exactly what a modifier is for
  expect(lazyMove(withWindows(threeSeatOpening, [theirs(10)]))).toBeNull()
  // already failed: nothing left worth spending a card on
  expect(lazyMove(withWindows(threeSeatOpening, [theirs(8)]))).toMatchObject({
    kind: 'skip',
  })
})

test('an empty hand skips: nothing to answer a reaction window with', () => {
  // A modifier window is answered with a Modifier card, a contestable play
  // with a Challenge card. Holding none of that type leaves only the pass —
  // even on somebody else's roll, and even at a roll of mine still short of
  // its mark, which is what the previous test leaves standing.
  const noModifiers: PlayerView = {
    ...threeSeatOpening,
    hand: threeSeatOpening.hand.filter((card) => card.type !== 'Modifier'),
  }
  expect(lazyMove(withWindows(noModifiers, [myRoll(8)]))).toMatchObject({
    kind: 'skip',
    windowId: 'window-modifier',
  })

  // holding one, there is still a decision to make
  const modifier = threeSeatOpening.hand.find((card) => card.type === 'Modifier')!
  expect(
    lazyMove(withWindows({ ...noModifiers, hand: [modifier] }, [myRoll(8)])),
  ).toBeNull()
})

test('in a challenge the bigger swing wins, whichever way the bias points', () => {
  const contest: PendingWindowView = {
    ...modifierWindowOpen.pendingWindows[0],
    windowId: 'contest',
    type: 'Challenge',
    cardId: 'card-1',
    canPass: false,
    detail: { challenged: true, defenderId: 'player-b', challengerId: 'player-c' },
    deadline: DEADLINE,
  }

  // +3/-1 is worth +3 — even where the bias would have said "lowest", which
  // is what a defender helping their own roll runs into.
  expect(
    lazyMove(withWindows(threeSeatOpening, [contest, valueChoice('lowest', [3, -1])])),
  ).toMatchObject({ choice: 3 })
  // +1/-3 is worth -3, even where the bias would have said "highest"
  expect(
    lazyMove(withWindows(threeSeatOpening, [contest, valueChoice('highest', [1, -3])])),
  ).toMatchObject({ choice: -3 })
  // evenly matched: the same swing either way, so it goes to the plus — on
  // my own roll, which is the half I keep (the owner, 2026-09-08)
  expect(
    lazyMove(withWindows(threeSeatOpening, [contest, valueChoice('lowest', [2, -2])])),
  ).toMatchObject({ choice: 2 })
  // and OUTSIDE a challenge the bias rules as before
  expect(
    lazyMove(withWindows(threeSeatOpening, [valueChoice('lowest', [3, -1])])),
  ).toMatchObject({ choice: -1 })
})


test('questions come before the table: a value is answered, the roll is not skipped under it', () => {
  const both = withWindows(threeSeatOpening, [myRoll(10), valueChoice('lowest')])
  expect(lazyMove(both)).toMatchObject({ kind: 'submit', windowId: 'value' })

  // a question it does NOT answer still stops it from settling the roll
  const asked: PendingWindowView = {
    windowId: 'sacrifice',
    type: 'CardChoice',
    respondentId: threeSeatOpening.playerId,
    options: ['hero-1'],
    detail: { question: 'Choose a hero to sacrifice' },
    deadline: DEADLINE,
    isYours: true,
  }
  expect(lazyMove(withWindows(threeSeatOpening, [myRoll(10), asked]))).toBeNull()
})

test('a re-armed window is answered again: the key is the question, not the answer', () => {
  const first = lazyMove(withWindows(threeSeatOpening, [myRoll(10)]))!
  const later = {
    ...myRoll(10),
    deadline: DEADLINE + 5_000,
  }
  const second = lazyMove(withWindows(threeSeatOpening, [later]))!
  expect(second.key).not.toBe(first.key)
})

test('an idle table asks nothing', () => {
  expect(lazyMove(threeSeatOpening)).toBeNull()
  expect(lazyMove({ ...threeSeatOpening, phase: 'Setup' })).toBeNull()
})

// EVERY modifier the base game prints, from every seat a player can hold in a
// challenge (the owner, 2026-09-08). The rule: take the biggest impact on the
// GAP between the two rolls, and put it where it helps you — a plus on the
// roll you are backing, a minus on the roll you are not. Level values go to
// the plus, on your own roll.
describe('a modifier in a challenge: the number, and the roll it lands on', () => {
  /** the five printed cards, by the values they carry */
  const CARDS: Record<string, number[]> = {
    '+1/-3': [1, -3],
    '+2/-2': [2, -2],
    '+3/-1': [3, -1],
    '+4': [4],
    '-4': [-4],
  }

  /** what Board does with the number: plus on the backed side, minus on the other */
  const landsOn = (value: number, backed: 'challenged' | 'challenger') =>
    value > 0 ? backed : backed === 'challenged' ? 'challenger' : 'challenged'

  it.each([
    ['+1/-3', -3],
    ['+2/-2', 2],
    ['+3/-1', 3],
    ['+4', 4],
    ['-4', -4],
  ])('%s is played as %s', (card, value) => {
    expect(lazyModifierValue(CARDS[card])).toBe(value)
  })

  const me = threeSeatOpening.playerId
  const other = 'player-b'
  const third = 'player-c'

  it('as the CHALLENGED, a plus comes to me and a minus goes to the challenger', () => {
    const backed = backedRole(threeSeatOpening, me, other)
    expect(backed).toBe('challenged')
    expect(landsOn(lazyModifierValue(CARDS['+3/-1'])!, backed)).toBe('challenged')
    expect(landsOn(lazyModifierValue(CARDS['+1/-3'])!, backed)).toBe('challenger')
    expect(landsOn(lazyModifierValue(CARDS['+2/-2'])!, backed)).toBe('challenged')
    expect(landsOn(lazyModifierValue(CARDS['+4'])!, backed)).toBe('challenged')
    expect(landsOn(lazyModifierValue(CARDS['-4'])!, backed)).toBe('challenger')
  })

  it('as the CHALLENGER, the same rule reads from my side', () => {
    const backed = backedRole(threeSeatOpening, other, me)
    expect(backed).toBe('challenger')
    expect(landsOn(lazyModifierValue(CARDS['+3/-1'])!, backed)).toBe('challenger')
    expect(landsOn(lazyModifierValue(CARDS['+1/-3'])!, backed)).toBe('challenged')
    expect(landsOn(lazyModifierValue(CARDS['+2/-2'])!, backed)).toBe('challenger')
    expect(landsOn(lazyModifierValue(CARDS['+4'])!, backed)).toBe('challenger')
    expect(landsOn(lazyModifierValue(CARDS['-4'])!, backed)).toBe('challenged')
  })

  it('as a THIRD player, I play it as the challenger would', () => {
    const backed = backedRole(threeSeatOpening, other, third)
    expect(backed).toBe('challenger')
    // identical to the challenger's row above, which is the whole rule
    expect(landsOn(lazyModifierValue(CARDS['+3/-1'])!, backed)).toBe('challenger')
    expect(landsOn(lazyModifierValue(CARDS['+1/-3'])!, backed)).toBe('challenged')
    expect(landsOn(lazyModifierValue(CARDS['+2/-2'])!, backed)).toBe('challenger')
  })

  it('a card with nothing on it is not played at all', () => {
    expect(lazyModifierValue([])).toBeNull()
  })
})
