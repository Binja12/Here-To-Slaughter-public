import { threeSeatOpening } from '../fixtures/views'
import type { MonsterCardData, PlayerView } from '../contract'
import { LiveRoll, rollHasModifierCard, rollLabel, rollOutcome } from './liveRoll'

const view: PlayerView = threeSeatOpening
const monster = view.monsterRow[0] as MonsterCardData

const heroRoll = (finalRoll: number, bonuses: LiveRoll['bonuses'] = []): LiveRoll => ({
  windowId: 'w',
  type: 'Modifier',
  rollerId: view.playerId,
  baseRoll: finalRoll - bonuses.reduce((sum, b) => sum + b.amount, 0),
  bonuses,
  finalRoll,
  rollReq: 8,
  subjectId: view.parties[0].leader.id,
})

const attack = (finalRoll: number): LiveRoll => ({
  windowId: 'w',
  type: 'Attack',
  rollerId: view.playerId,
  baseRoll: finalRoll,
  bonuses: [],
  finalRoll,
  subjectId: monster.id,
})

test('a hero roll is green over its requirement and red under it', () => {
  expect(rollOutcome(heroRoll(8), view)).toBe('success')
  expect(rollOutcome(heroRoll(7), view)).toBe('failure')
})

test("a monster roll is green in its slay band, red in its fight-back band, nothing between", () => {
  expect(rollOutcome(attack(monster.higherReq), view)).toBe('success')
  expect(rollOutcome(attack(monster.lowerReq), view)).toBe('failure')
  const between = monster.lowerReq + 1
  if (between < monster.higherReq) expect(rollOutcome(attack(between), view)).toBe('none')
})

test('the label shows the total, not the arithmetic', () => {
  const modifier = view.hand.find((card) => card.type === 'Modifier')
  const roll = heroRoll(8, [{ cardSource: modifier?.id ?? 'x', amount: 2 }])
  expect(rollLabel(roll, view)).toBe('you rolled 8 · need 8+')
  expect(rollLabel(heroRoll(6), view)).toBe('you rolled 6 · need 8+')
})

test('a modifier card on the roll is what opens the modifier window; a standing bonus is not', () => {
  const modifier = view.hand.find((card) => card.type === 'Modifier')
  expect(modifier).toBeDefined()
  expect(rollHasModifierCard(heroRoll(8, [{ cardSource: modifier!.id, amount: 2 }]), view)).toBe(true)
  expect(rollHasModifierCard(heroRoll(8, [{ cardSource: view.parties[0].leader.id, amount: 1 }]), view)).toBe(false)
  expect(rollHasModifierCard(heroRoll(8), view)).toBe(false)
})
