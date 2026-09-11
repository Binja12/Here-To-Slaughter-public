import { PlayerView } from '../contract'
import { PlayerId } from './layout'

export type SeatSlots = Record<PlayerId, string | null>

/**
 * Where each seat sits on this screen. The viewer is always p1 (bottom);
 * the others follow the turn rotation clockwise from the viewer. The owner's
 * layout (2026-09-03): two players face each other (top), three players
 * put the others on the sides (left, right), four fill all seats
 * (left, top, right).
 */
export function slotsFor(view: PlayerView): SeatSlots {
  const mine = view.seats.find((seat) => seat.playerId === view.playerId)
  if (!mine) return { p1: view.playerId, p2: null, p3: null, p4: null }

  const others = view.seats
    .filter((seat) => seat.playerId !== view.playerId)
    .sort((a, b) => {
      const da = (a.seat - mine.seat + view.seats.length) % view.seats.length
      const db = (b.seat - mine.seat + view.seats.length) % view.seats.length
      return da - db
    })
    .map((seat) => seat.playerId)

  switch (others.length) {
    case 1:
      return { p1: view.playerId, p2: others[0], p3: null, p4: null }
    case 2:
      return { p1: view.playerId, p2: null, p3: others[0], p4: others[1] }
    default:
      return {
        p1: view.playerId,
        p3: others[0] ?? null,
        p2: others[1] ?? null,
        p4: others[2] ?? null,
      }
  }
}

export function slotForPlayer(view: PlayerView, playerId: string): PlayerId | null {
  const entries = Object.entries(slotsFor(view)) as [PlayerId, string | null][]
  return entries.find(([, id]) => id === playerId)?.[0] ?? null
}

/**
 * What to CALL a seat on this screen. The viewer is never named — they are
 * "YOU" wherever they appear (the owner, 2026-09-07) — and everyone else is
 * their own name. One function, so no two corners of the board can disagree.
 */
export function nameOf(view: PlayerView, playerId?: string): string {
  if (!playerId) return 'player'
  if (playerId === view.playerId) return 'YOU'
  return view.seats.find((seat) => seat.playerId === playerId)?.name ?? 'player'
}
