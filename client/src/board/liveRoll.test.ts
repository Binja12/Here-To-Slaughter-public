import { modifierWindowOpen, threeSeatOpening } from '../fixtures/views'
import type { MonsterCardData, PlayerView } from '../contract'
import { LiveRoll, liveRollOf, rollLabel, rollOutcome } from './liveRoll'

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
  targetPlayerIds: [],
})

const attack = (finalRoll: number): LiveRoll => ({
  windowId: 'w',
  type: 'Attack',
  rollerId: view.playerId,
  baseRoll: finalRoll,
  bonuses: [],
  finalRoll,
  subjectId: monster.id,
  targetPlayerIds: [],
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
  expect(rollLabel(roll, view)).toBe('YOU rolled 8 · need +0')
  expect(rollLabel(heroRoll(6), view)).toBe('YOU rolled 6 · need +2')
  expect(rollLabel(heroRoll(10), view)).toBe('YOU rolled 10 · need +0')
  // a monster: the distance to each outcome, not the thresholds
  const between = monster.higherReq - 1
  expect(rollLabel(attack(between), view)).toBe(
    `YOU rolled ${between} · slay +1 · hit back −${between - monster.lowerReq}`,
  )
  expect(rollLabel(attack(monster.higherReq), view)).toContain('slay +0')
  expect(rollLabel(attack(monster.lowerReq), view)).toContain('hit back −0')
})

test('the roll carries every seat its effect targets, once the server says so', () => {
  const untargeted = liveRollOf(modifierWindowOpen)
  expect(untargeted?.targetPlayerIds).toEqual([])

  const [window] = modifierWindowOpen.pendingWindows
  const aimedAt = (targets: unknown) =>
    liveRollOf({
      ...modifierWindowOpen,
      pendingWindows: [{ ...window, detail: { ...window.detail, targets } }],
    })

  expect(aimedAt([{ playerId: 'player-b', zone: 'Party' }])?.targetPlayerIds).toEqual([
    'player-b',
  ])
  // one card may aim at two seats under a single window (Fluffy)
  expect(
    aimedAt([
      { playerId: 'player-b', zone: 'Party' },
      { playerId: 'player-c', zone: 'Party' },
    ])?.targetPlayerIds,
  ).toEqual(['player-b', 'player-c'])
  // anything malformed is simply not a target
  expect(aimedAt([{ playerId: 7 }, 'nope'])?.targetPlayerIds).toEqual([])
})
