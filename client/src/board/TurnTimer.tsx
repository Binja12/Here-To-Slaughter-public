import React, { useEffect, useState } from 'react'
import type { TurnClockView } from '../contract'

/**
 * The active seat's turn clock, drawn left of the action-point bar and the
 * End Turn button: a ring that empties as the turn runs out, with the time
 * spelled out inside it.
 *
 * The clock is the TABLE's, not the viewer's — every screen watches the same
 * numbers, which is what tells a waiting seat how long the turn still has.
 *
 * Two halves, because a snapshot only arrives when the board changes and the
 * seconds in between still have to pass on screen: `deadline` is an instant
 * the server fixes once per running stretch, and this ticks against the local
 * clock until the next snapshot names a new one.
 *
 * A reaction window HOLDS the engine's clock (TurnManager pauses on
 * ReactionWindowOpened, anyone's), and a held clock arrives as `heldMs` with
 * no deadline. It is drawn still and dimmed rather than hidden, so a seat
 * answering a window can see the turn it is holding up.
 */
export default function TurnTimer({ clock }: { clock?: TurnClockView }) {
  const now = useTicking(clock?.deadline)
  if (!clock) return null

  const held = clock.deadline === undefined
  const remaining = held
    ? (clock.heldMs ?? 0)
    : Math.max(0, clock.deadline! - now)
  const fraction = Math.max(0, Math.min(1, remaining / clock.turnTimeMs))
  // The last tenth is the warning, and only while the clock actually runs: a
  // held clock is nobody's fault and must not flash red.
  const urgent = !held && fraction <= 0.1

  const R = 42
  const circumference = 2 * Math.PI * R

  return (
    <div
      className="relative h-full w-full"
      title={
        held
          ? 'turn clock — held while a reaction window is open'
          : 'turn clock'
      }
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="rgba(9,9,11,0.72)"
          stroke="rgba(0,0,0,0.55)"
          strokeWidth="9"
        />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={held ? '#78716c' : urgent ? '#f87171' : '#fbbf24'}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          opacity={held ? 0.6 : 1}
          style={{ transition: 'stroke-dashoffset 240ms linear, stroke 240ms' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span
          className={`font-heading text-[1.4cqh] font-bold tabular-nums ${
            held ? 'text-stone-400' : urgent ? 'text-red-300' : 'text-amber-200'
          }`}
        >
          {formatRemaining(remaining)}
        </span>
        {held && (
          <span className="mt-[0.3cqh] text-[0.7cqh] uppercase tracking-[0.1em] text-stone-500">
            held
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * A clock reading that advances four times a second while a deadline stands,
 * and never while one does not: a held clock has nothing to count.
 */
function useTicking(deadline?: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (deadline === undefined) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [deadline])
  return now
}

/** 45300 → "0:46"; under ten seconds it counts in tenths. */
function formatRemaining(ms: number): string {
  if (ms < 10_000) return (ms / 1000).toFixed(1)
  const total = Math.ceil(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
