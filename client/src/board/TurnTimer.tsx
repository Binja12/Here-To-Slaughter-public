import React, { useEffect, useState } from 'react'
import type { TurnClockView } from '../contract'

/**
 * The table's turn clock (HUD_WIDGETS.turnTimer). Ticks against the local
 * clock between snapshots while `deadline` stands; a held clock (`heldMs`,
 * a reaction window open) is drawn still and dimmed.
 */
export default function TurnTimer({ clock, reaction = false }: { clock?: TurnClockView; reaction?: boolean }) {
  const now = useTicking(clock?.deadline)
  if (!clock) return null

  const held = clock.deadline === undefined
  const remaining = held
    ? (clock.heldMs ?? 0)
    : Math.max(0, clock.deadline! - now)
  const fraction = Math.max(0, Math.min(1, remaining / clock.turnTimeMs))
  const urgent = reaction || (!held && fraction <= 0.1)

  const R = 42
  const circumference = 2 * Math.PI * R

  return (
    <div
      className="relative h-full w-full"
      title={
        reaction ? 'reaction clock' : held
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

/** Advances four times a second while a deadline stands. */
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
