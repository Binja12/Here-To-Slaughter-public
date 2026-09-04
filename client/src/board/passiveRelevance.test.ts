import type { EffectView, PlayerView } from '../contract'
import {
  challengeStarted,
  challengeWindowOpen,
  midGame,
  modifierWindowOpen,
  threeSeatOpening,
} from '../fixtures/views'
import { AP_PER_TURN, passiveSourceIds } from './passiveRelevance'

const withEffect = (view: PlayerView, playerId: string, effect: Omit<EffectView, 'id'>): PlayerView => ({
  ...view,
  seats: view.seats.map((seat) =>
    seat.playerId === playerId ? { ...seat, effects: [...seat.effects, { id: `e-${effect.sourceCardId}`, ...effect }] } : seat,
  ),
})

// the Fist of Reason leads player-c in every fixture
const fist = threeSeatOpening.parties[2].leader.id
const fistBonus: Omit<EffectView, 'id'> = { sourceCardId: fist, type: 'RollBonus', value: 2, rollContext: 'Challenge' }

test('a challenge bonus glows only while its owner could challenge', () => {
  expect(passiveSourceIds(withEffect(threeSeatOpening, 'player-c', fistBonus)).has(fist)).toBe(false)
  // a Modifier window is not a challenge
  expect(passiveSourceIds(withEffect(modifierWindowOpen, 'player-c', fistBonus)).has(fist)).toBe(false)
  // player-b's card is on the table: player-c may challenge it
  expect(passiveSourceIds(withEffect(challengeWindowOpen, 'player-c', fistBonus)).has(fist)).toBe(true)
  // the defender's own Fist would not help: it cannot challenge its own play
  const fistOnDefender = withEffect(challengeWindowOpen, 'player-b', { ...fistBonus, sourceCardId: 'their-fist' })
  expect(passiveSourceIds(fistOnDefender).has('their-fist')).toBe(false)
  // started by player-a: only the challenger's bonus is in play
  expect(passiveSourceIds(withEffect(challengeStarted, 'player-c', fistBonus)).has(fist)).toBe(false)
  expect(passiveSourceIds(withEffect(challengeStarted, 'player-a', { ...fistBonus, sourceCardId: 'a-fist' })).has('a-fist')).toBe(true)
})

test('the Protecting Horn glows while a modifier could be played', () => {
  const horn = { ...threeSeatOpening.parties[0].leader, id: 'leader-121', name: 'The Protecting Horn' }
  const withHorn = (view: PlayerView): PlayerView => ({
    ...view,
    parties: view.parties.map((party, index) => (index === 0 ? { ...party, leader: horn } : party)),
  })
  expect(passiveSourceIds(withHorn(threeSeatOpening)).has('leader-121')).toBe(false)
  expect(passiveSourceIds(withHorn(modifierWindowOpen)).has('leader-121')).toBe(true)
  // an unstarted challenge takes no modifier yet; a started one does
  expect(passiveSourceIds(withHorn(challengeWindowOpen)).has('leader-121')).toBe(false)
  expect(passiveSourceIds(withHorn(challengeStarted)).has('leader-121')).toBe(true)
})

test('an action-point bonus glows while its owner holds more than the budget', () => {
  const slime = midGame.parties[0].monsters[0].id
  const bonus: Omit<EffectView, 'id'> = { sourceCardId: slime, type: 'ActionPointBonus', value: 1 }
  const at = (points: number): PlayerView => ({
    ...withEffect(midGame, 'player-a', bonus),
    seats: withEffect(midGame, 'player-a', bonus).seats.map((seat) =>
      seat.playerId === 'player-a' ? { ...seat, actionPoints: points } : seat,
    ),
  })
  expect(passiveSourceIds(at(AP_PER_TURN)).has(slime)).toBe(false)
  expect(passiveSourceIds(at(AP_PER_TURN + 1)).has(slime)).toBe(true)
})

test('a shield glows while an opponent is picking a card, and the open roll names its own sources', () => {
  const shield: Omit<EffectView, 'id'> = { sourceCardId: 'blade', type: 'CantBeDestroyed' }
  const opponentPicks: PlayerView = {
    ...withEffect(midGame, 'player-a', shield),
    pendingWindows: [
      { windowId: 'w', type: 'CardChoice', respondentId: 'player-b', deadline: Date.now() + 1000, isYours: false },
    ],
  }
  expect(passiveSourceIds(withEffect(midGame, 'player-a', shield)).has('blade')).toBe(false)
  expect(passiveSourceIds(opponentPicks).has('blade')).toBe(true)
  // the open roll's bonus source (the server's list) always glows
  const bonuses = modifierWindowOpen.pendingWindows[0].detail!.bonuses as { cardSource: string }[]
  const bonusSource = bonuses[0].cardSource
  expect(passiveSourceIds(modifierWindowOpen).has(bonusSource)).toBe(true)
})
