import React, { useEffect, useRef, useState } from 'react'
import { DieIcon } from './icons'

// Center-table dice. Rolls are authoritative on the server (they happen as
// part of hero effects, attacks and challenges), so there is no client-side
// "roll" button — the tray animates whenever a new DiceRolled event lands
// and always displays the last reported total.

type DiceTrayProps = {
  lastRoll: number | null
  /** monotonically increasing id of the last DiceRolled event */
  rollKey: number
}

export default function DiceTray({ lastRoll, rollKey }: DiceTrayProps) {
  const [rolling, setRolling] = useState(false)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setRolling(true)
    const t = setTimeout(() => setRolling(false), 700)
    return () => clearTimeout(t)
  }, [rollKey])

  return (
    <div
      className={`dice-tray ${rolling ? 'dice-rolling' : ''}`}
      role="status"
      aria-label={
        lastRoll == null ? 'No dice rolled yet' : `Last dice roll: ${lastRoll}`
      }
    >
      <span className="zone-caption">Dice</span>
      <div className="dice-tray-well">
        {/* the server reports only the total, so the dice stay decorative */}
        <span className="dice-die dice-die-a">
          <DieIcon size={34} />
        </span>
        <span className="dice-die dice-die-b">
          <DieIcon size={34} />
        </span>
        <span className="dice-total">{rolling ? '…' : lastRoll ?? '—'}</span>
      </div>
      <span className="dice-caption">Roll dice to use hero effects</span>
    </div>
  )
}
