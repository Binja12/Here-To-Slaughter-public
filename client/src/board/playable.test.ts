import {
  challengeStarted,
  challengeWindowOpen,
  modifierWindowOpen,
  threeSeatOpening,
} from '../fixtures/views'
import { derivePlayable, holdsAnswer } from './playable'

test('main actions follow only the turn, phase, busy, and view flags', () => {
  const flags = derivePlayable(threeSeatOpening)
  expect(flags.mainDeck).toBe(true)
  expect(flags.endTurn).toBe(true)
  expect(flags.monsters).toEqual(
    threeSeatOpening.monsterRow.map((card) =>
      threeSeatOpening.attackableMonsterIds.includes(card.id),
    ),
  )
  expect(flags.heroes).toEqual(
    threeSeatOpening.parties[0].heroes.map((hero) => hero.canRollOn),
  )
})

test('a glow never offers what the seat cannot pay for', () => {
  const seats = threeSeatOpening.seats.map((seat) =>
    seat.playerId === threeSeatOpening.playerId ? { ...seat, actionPoints: 1 } : seat,
  )
  const flags = derivePlayable({ ...threeSeatOpening, seats })
  // 1 AP: an attack (2) and a redraw (3) are out, a draw / play / roll (1) still in
  expect(flags.monsters.every((enabled) => !enabled)).toBe(true)
  expect(flags.redraw).toBe(false)
  expect(flags.mainDeck).toBe(true)
  expect(flags.heroes).toEqual(
    threeSeatOpening.parties[0].heroes.map((hero) => hero.canRollOn),
  )
  expect(flags.endTurn).toBe(true)
})

test('busy disables all presentation actions', () => {
  const flags = derivePlayable({ ...threeSeatOpening, busy: true })
  expect(flags.mainDeck).toBe(false)
  expect(flags.endTurn).toBe(false)
  expect(flags.hand.every((enabled) => !enabled)).toBe(true)
  expect(flags.heroes.every((enabled) => !enabled)).toBe(true)
  expect(flags.monsters.every((enabled) => !enabled)).toBe(true)
})

test('reaction windows light only the matching reaction cards', () => {
  const modifierFlags = derivePlayable(modifierWindowOpen)
  expect(modifierFlags.mainDeck).toBe(false)
  expect(
    modifierWindowOpen.hand.map((card, index) => ({
      type: card.type,
      enabled: modifierFlags.hand[index],
    })),
  ).toEqual(
    modifierWindowOpen.hand.map((card) => ({
      type: card.type,
      enabled: card.type === 'Modifier',
    })),
  )

  const offTurnChallenge = {
    ...challengeWindowOpen,
    currentPlayerId: 'player-b',
    seats: challengeWindowOpen.seats.map((seat) => ({
      ...seat,
      isCurrentTurn: seat.playerId === 'player-b',
    })),
  }
  // Nobody has challenged yet: only a challenge card can answer (the server
  // refuses a modifier with ChallengeNotStarted).
  const challengeFlags = derivePlayable(offTurnChallenge)
  expect(challengeFlags.mainDeck).toBe(false)
  offTurnChallenge.hand.forEach((card, index) => {
    expect(challengeFlags.hand[index]).toBe(card.type === 'Challenge')
  })
  expect(challengeFlags.hand.some(Boolean)).toBe(true)

  // Somebody did: both sides rolled, so only a modifier can answer now
  // (a second challenge card is ChallengeAlreadyStarted).
  const startedFlags = derivePlayable({
    ...offTurnChallenge,
    pendingWindows: challengeStarted.pendingWindows,
  })
  offTurnChallenge.hand.forEach((card, index) => {
    expect(startedFlags.hand[index]).toBe(card.type === 'Modifier')
  })
  expect(startedFlags.hand.some(Boolean)).toBe(true)
})

test('the hand only counts as an answer when it holds the card the window wants', () => {
  // a modifier window wants a Modifier, a contestable play wants a Challenge
  expect(holdsAnswer(modifierWindowOpen)).toBe(true)
  expect(holdsAnswer(challengeWindowOpen)).toBe(true)

  const without = (type: string) => (view: typeof modifierWindowOpen) => ({
    ...view,
    hand: view.hand.filter((card) => card.type !== type),
  })
  expect(holdsAnswer(without('Modifier')(modifierWindowOpen))).toBe(false)
  expect(holdsAnswer(without('Challenge')(challengeWindowOpen))).toBe(false)

  // no window open: nothing to answer, so nothing is held for it
  expect(holdsAnswer(threeSeatOpening)).toBe(false)
})
