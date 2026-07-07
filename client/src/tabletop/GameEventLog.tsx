import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CardData, GameEventDto } from '../types'
import { accentFor, describeEvent } from './model'

// Collapsible chronicle along the lower-left edge. Entries carry the acting
// player's accent and a small semantic glyph; kept compact and out of the way.

type GameEventLogProps = {
  log: GameEventDto[]
  cardOf: (id: string) => CardData | undefined
  nameOf: (playerId: string) => string
  playerIndex: (playerId: string) => number
}

export default function GameEventLog({
  log,
  cardOf,
  nameOf,
  playerIndex,
}: GameEventLogProps) {
  const [open, setOpen] = useState(true)
  const endRef = useRef<HTMLDivElement>(null)

  const entries = useMemo(
    () =>
      log
        .map((e, i) => {
          const d = describeEvent(e, cardOf, nameOf)
          return d
            ? {
                key: i,
                ...d,
                accent: e.playerId
                  ? accentFor(e.playerId, playerIndex(e.playerId))
                  : '#8d8375',
              }
            : null
        })
        .filter((e): e is NonNullable<typeof e> => !!e)
        .slice(-24),
    [log, cardOf, nameOf, playerIndex],
  )

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [entries, open])

  return (
    <section className={`event-log ${open ? 'event-log-open' : ''}`} aria-label="Game events">
      <button
        className="event-log-tab"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        Chronicle {open ? '▾' : '▴'}
      </button>
      {open && (
        <div className="event-log-scroll" aria-live="polite">
          {entries.length === 0 && (
            <div className="event-line event-line-empty">
              The tale has yet to begin…
            </div>
          )}
          {entries.map((e) => (
            <div key={e.key} className="event-line">
              <span
                className="event-dot"
                style={{ background: e.accent }}
                aria-hidden="true"
              />
              <span className="event-icon" aria-hidden="true">
                {e.icon}
              </span>
              <span className="event-text">{e.text}</span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </section>
  )
}
