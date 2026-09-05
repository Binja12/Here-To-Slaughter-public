import React, { useMemo } from 'react'
import { useOptionalGameView } from '../state/game'
import { subjectIdOf } from './liveRoll'
import TurnTimer from './TurnTimer'

/** Shares the card's zoom layer, moving beside its art while enlarged. */
export default function CardReactionTimer({ cardId, handIndex, zoomed = false }: {
  cardId?: string
  handIndex?: number
  zoomed?: boolean
}) {
  const view = useOptionalGameView()
  const handCard = handIndex === undefined ? undefined : view?.hand[handIndex]
  const id = cardId ?? handCard?.id
  const window = (view?.pendingWindows ?? []).filter((window) => {
    if (id && subjectIdOf(window) === id) return true
    if (window.isYours && (window.detail?.cardId === id || window.detail?.sourceCardId === id)) return true
    if (handCard?.type === 'Challenge') return window.type === 'Challenge' &&
      window.respondentId !== view?.playerId && window.detail?.challenged !== true && window.detail?.challengeable !== false
    if (handCard?.type === 'Modifier') return window.type === 'Modifier' || window.type === 'Attack' ||
      (window.type === 'Challenge' && window.detail?.challenged === true)
    return false
  }).sort((a, b) => a.deadline - b.deadline)[0]
  const deadline = window?.deadline
  const duration = useMemo(() => Math.max(1, (deadline ?? 0) - Date.now()), [deadline])
  if (!window || deadline === undefined || deadline <= Date.now()) return null
  return (
    <div className="pointer-events-none absolute z-50 aspect-square transition-[left,top] duration-150"
      style={{ width: '34%', left: zoomed ? '103%' : '33%', top: zoomed ? '30%' : '25%' }}>
      <TurnTimer clock={{ turnTimeMs: duration, deadline }} reaction />
    </div>
  )
}
