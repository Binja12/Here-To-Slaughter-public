import { useEffect, useRef, useState } from 'react'
import type { PendingWindowView, PlayerView } from '../contract'
import type { DiceRollState } from './DiceRoll'
import { nameOf, slotForPlayer } from './seats'
import { cardById } from './viewTargets'

/**
 * The roll the table is watching right now, read off the server's open
 * Modifier / Attack window. The engine rolls ONE number (`baseRoll`); the
 * two die faces the board throws are a cosmetic split of it (`facesOf`).
 * `bonuses` are the server's `{ cardSource, amount }` entries — standing
 * effects plus every modifier played so far.
 */
export type RollBonusView = { cardSource: string; amount: number }

export type LiveRoll = {
  windowId: string
  type: 'Modifier' | 'Attack'
  rollerId: string
  baseRoll: number
  bonuses: RollBonusView[]
  finalRoll: number
  /** A hero / leader roll's printed requirement. Absent for attacks. */
  rollReq?: number
  /** The hero, leader or monster the roll is about. */
  subjectId?: string
  /** The seats the roll's effect is aimed at, once its owner has chosen. */
  targetPlayerIds: string[]
}

const str = (value: unknown) => (typeof value === 'string' ? value : undefined)
const num = (value: unknown) => (typeof value === 'number' ? value : undefined)

/** One seat a roll's effect is aimed at, and the zone of theirs it reaches. */
export type RollTargetView = { playerId: string; zone: string }

/**
 * Whom a roll is aimed at. A LIST: one card may choose several targets under
 * a single window (Fluffy destroys two heroes), and every seat named has to
 * see that it is one of them.
 */
export function targetSeatsOf(value: unknown): RollTargetView[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { playerId, zone } = entry as Record<string, unknown>
    return typeof playerId === 'string' && typeof zone === 'string'
      ? [{ playerId, zone }]
      : []
  })
}

export function bonusesOf(value: unknown): RollBonusView[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { cardSource, amount } = entry as Record<string, unknown>
    return typeof amount === 'number'
      ? [{ cardSource: str(cardSource) ?? '', amount }]
      : []
  })
}

export const bonusTotal = (bonuses: RollBonusView[]) =>
  bonuses.reduce((sum, bonus) => sum + bonus.amount, 0)

/**
 * The card a window is about, wherever the server put it: `cardId` on a
 * Challenge window, `detail.heroId` on a hero or leader roll,
 * `detail.monsterId` on an attack.
 */
export function subjectIdOf(window: PendingWindowView): string | undefined {
  const detail = window.detail ?? {}
  return window.cardId ?? str(detail.heroId) ?? str(detail.monsterId)
}

export function liveRollOf(view: PlayerView): LiveRoll | null {
  for (const window of view.pendingWindows) {
    if (window.type !== 'Modifier' && window.type !== 'Attack') continue
    const detail = window.detail
    if (!detail) continue
    const baseRoll = num(detail.baseRoll)
    if (baseRoll === undefined) continue
    const bonuses = bonusesOf(detail.bonuses)
    return {
      windowId: window.windowId,
      type: window.type,
      rollerId: str(detail.rollerId) ?? window.respondentId,
      baseRoll,
      bonuses,
      finalRoll: num(detail.finalRoll) ?? baseRoll + bonusTotal(bonuses),
      rollReq: num(detail.rollReq),
      subjectId: subjectIdOf(window),
      targetPlayerIds: targetSeatsOf(detail.targets).map((seat) => seat.playerId),
    }
  }
  return null
}

/**
 * Two die faces that add up to the server's one number. Chosen by `seed`
 * so every re-render of the same window agrees; other seats may see a
 * different split of the same total, which is fine — the total is the
 * server's, the faces are decoration.
 */
export function facesOf(sum: number, seed: string): [number, number] {
  if (sum <= 2) return [1, 1]
  if (sum >= 12) return [6, 6]
  const lo = Math.max(1, sum - 6)
  const hi = Math.min(6, sum - 1)
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const first = lo + (hash % (hi - lo + 1))
  return [first, sum - first]
}

/**
 * How far the roll stands from each outcome — what must still be added to
 * reach it, or taken off to fall to it — never the printed thresholds
 * (the owner, 2026-09-06: a 7 against "slay 8+, hit back ≤5" reads
 * "slay +1 · hit back −2"). Empty when nothing is printed.
 */
export function rollNeedLabel(roll: LiveRoll, view: PlayerView): string {
  if (roll.rollReq !== undefined) return `need +${Math.max(0, roll.rollReq - roll.finalRoll)}`
  const monster = cardById(view, roll.subjectId)
  if (monster?.type !== 'Monster') return ''
  const up = (req: number) => `+${Math.max(0, req - roll.finalRoll)}`
  const down = (req: number) => `−${Math.max(0, roll.finalRoll - req)}`
  return monster.rollCompareMode === 'LowToWin'
    ? `slay ${down(monster.lowerReq)}`
    : `slay ${up(monster.higherReq)} · hit back ${down(monster.lowerReq)}`
}

export type RollOutcome = 'success' | 'failure' | 'none'

/**
 * What the roll means as it stands: over a hero's requirement or short of
 * it; for a monster, in its slay band, its fight-back band, or between the
 * two (the "nothing happens" band, which has no colour). Read live, so a
 * modifier landing moves it.
 */
export function rollOutcome(roll: LiveRoll, view: PlayerView): RollOutcome {
  if (roll.rollReq !== undefined) return roll.finalRoll >= roll.rollReq ? 'success' : 'failure'
  const monster = cardById(view, roll.subjectId)
  if (monster?.type !== 'Monster') return 'none'
  if (monster.rollCompareMode === 'LowToWin') {
    if (roll.finalRoll <= monster.lowerReq) return 'success'
    return roll.finalRoll >= monster.higherReq ? 'failure' : 'none'
  }
  if (roll.finalRoll >= monster.higherReq) return 'success'
  return roll.finalRoll <= monster.lowerReq ? 'failure' : 'none'
}

/** Whether a modifier CARD has landed on the roll — standing effects alone are not "someone applied a modifier". */
/** The banner text while a roll is open: the total as it stands, against what. */
export function rollLabel(roll: LiveRoll, view: PlayerView): string {
  const need = rollNeedLabel(roll, view)
  return `${nameOf(view, roll.rollerId)} rolled ${roll.finalRoll}${need ? ` · ${need}` : ''}`
}

/**
 * The dice on the felt: thrown once per roll window at the roller's seat,
 * left where they landed until the turn passes.
 */
export function useLiveDice(view: PlayerView, roll: LiveRoll | null): DiceRollState | null {
  const [dice, setDice] = useState<DiceRollState | null>(null)
  const sequence = useRef(0)
  const windowId = roll?.windowId
  const baseRoll = roll?.baseRoll
  const seat = roll ? slotForPlayer(view, roll.rollerId) : null

  useEffect(() => {
    if (!windowId || !seat || baseRoll === undefined) return
    setDice({ seat, values: facesOf(baseRoll, windowId), nonce: ++sequence.current })
  }, [windowId, seat, baseRoll])

  const turn = view.currentPlayerId
  const phase = view.phase
  useEffect(() => {
    setDice(null)
  }, [turn, phase])

  return dice
}
