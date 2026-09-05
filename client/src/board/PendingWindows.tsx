import React, { useEffect, useRef, useState } from 'react'
import type { PendingWindowView, PlayerView } from '../contract'
import { artFor } from './assets'
import { cardById } from './viewTargets'
import { tkey, useTargetable } from './targeting'

export default function PendingWindows({
  view,
  hiddenWindowIds = [],
  onSubmit,
}: {
  view: PlayerView
  /** choices the board answers by itself (gold targets) — no card here */
  hiddenWindowIds?: string[]
  onSubmit: (windowId: string, choice: unknown) => void
}) {
  // Only the windows that need a BUTTON from THIS seat (its own choices).
  // A roll or a challenge is told by the board itself — the reaction card
  // glowing in the hand, the dice at the roller's seat, the overlays — and
  // another seat's question is theirs to answer: no "waiting for…" card
  // (the owner, 2026-09-03 and 2026-09-05).
  const visibleWindows = view.pendingWindows.filter(
    (window) =>
      window.isYours &&
      window.type !== 'Modifier' &&
      window.type !== 'Attack' &&
      window.type !== 'Challenge' &&
      !hiddenWindowIds.includes(window.windowId),
  )
  if (visibleWindows.length === 0) return null

  return (
    <div className="pointer-events-none absolute left-1/2 top-[1cqh] z-[130] flex max-w-[94cqw] -translate-x-1/2 gap-[0.7cqw]">
      {visibleWindows.map((window) => (
        <WindowCard
          key={window.windowId}
          view={view}
          window={window}
          onSubmit={onSubmit}
        />
      ))}
    </div>
  )
}

function WindowCard({
  view,
  window,
  onSubmit,
}: {
  view: PlayerView
  window: PendingWindowView
  onSubmit: (windowId: string, choice: unknown) => void
}) {
  const respondent = view.seats.find(
    (seat) => seat.playerId === window.respondentId,
  )
  const card = cardById(view, window.cardId)
  const art = card ? artFor(card) : null
  const target = useTargetable(tkey.pendingWindow(window.windowId))
  return (
    <div
      className={`pointer-events-auto relative flex min-h-[9cqh] w-[18cqw] overflow-hidden rounded-[0.5cqw] border border-amber-300/50 bg-zinc-950/95 p-[0.55cqw] text-amber-50 shadow-[0_0.3cqw_1cqw_rgba(0,0,0,0.65)] ${target.className}`}
      onClick={target.onClick}
    >
      {art && card && (
        <img
          src={art.url}
          alt={card.name}
          draggable={false}
          className="mr-[0.55cqw] h-[7cqh] flex-none select-none rounded-[0.25cqw] object-contain"
          style={{ aspectRatio: String(art.aspect) }}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-[0.3cqh]">
        <div className="font-heading text-[0.72cqw] leading-tight text-amber-300">
          {window.type}
        </div>
        <div className="text-[0.58cqw] leading-tight text-stone-200">
          {window.isYours
            ? `Your response${respondent ? `, ${respondent.name}` : ''}`
            : `Waiting for ${respondent?.name ?? 'player'}…`}
        </div>

        {window.detail && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-[.35cqw] text-[0.5cqw] leading-tight text-stone-300">
            {Object.entries(window.detail).map(([key, value]) => (
              <React.Fragment key={key}>
                <dt className="text-amber-200/70">{humanize(key)}</dt>
                <dd className="truncate text-right">{formatDetailValue(value, view)}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}

        {window.isYours && window.options && (
          <div className="mt-auto flex flex-wrap gap-[0.3cqw]">
            {window.options.map((option, index) => (
              <ChoiceButton
                key={`${String(option)}-${index}`}
                onClick={() => onSubmit(window.windowId, option)}
              >
                {optionLabel(option, view)}
              </ChoiceButton>
            ))}
          </div>
        )}

        <Countdown deadline={window.deadline} />
      </div>
    </div>
  )
}

function humanize(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}

function formatDetailValue(value: unknown, view: PlayerView): string {
  if (typeof value === 'string') {
    return (
      view.seats.find((seat) => seat.playerId === value)?.name ??
      cardById(view, value)?.name ??
      value
    )
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return '—'
  return JSON.stringify(value)
}

function optionLabel(option: unknown, view: PlayerView): string {
  if (typeof option === 'string') {
    const resolved =
      view.seats.find((seat) => seat.playerId === option)?.name ??
      cardById(view, option)?.name
    if (resolved) return resolved
    return humanize(option.toLowerCase())
  }
  if (typeof option === 'number') {
    return `${option > 0 ? '+' : option < 0 ? '−' : ''}${Math.abs(option)}`
  }
  return formatDetailValue(option, view)
}

function ChoiceButton({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="rounded border border-amber-400/70 bg-amber-900/70 px-[0.4cqw] py-[0.18cqh] text-[0.55cqw] text-amber-100 transition hover:bg-amber-700/80"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )
}

function Countdown({ deadline }: { deadline: number }) {
  const initial = useRef(Math.max(1, deadline - Date.now()))
  const [remaining, setRemaining] = useState(initial.current)
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, deadline - Date.now()))
    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [deadline])
  return (
    <div className="mt-auto">
      <div className="mb-[.1cqh] text-right text-[.45cqw] text-amber-100/70">
        {(remaining / 1000).toFixed(1)}s
      </div>
      <div className="h-[0.35cqh] overflow-hidden rounded-full bg-black/60">
        <div
          className="h-full bg-amber-400 transition-[width] duration-200"
          style={{ width: `${Math.min(100, (remaining / initial.current) * 100)}%` }}
        />
      </div>
    </div>
  )
}
