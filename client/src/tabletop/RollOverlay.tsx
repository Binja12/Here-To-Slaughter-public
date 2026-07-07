import React, { useEffect, useState } from 'react'
import { CardData, ModifierReactionDto, ModifierWindowDto } from '../types'
import CardFrame from './cards/CardFrame'
import Tooltip from './Tooltip'

// Pending-roll resolution overlay, driven entirely by snapshot.modifierWindow.
// Shows the authoritative base roll, running total and target, and lets the
// local player play modifier cards from hand (a reaction — costs no AP).

type RollOverlayProps = {
  window: ModifierWindowDto
  rollerName: string
  hero?: CardData
  hand: string[]
  cardOf: (id: string) => CardData | undefined
  onPlayModifier: (dto: ModifierReactionDto) => void
  onSkip: () => void
}

function useCountdown(openedAt: number, timeoutMs: number): number {
  const [remaining, setRemaining] = useState(1)
  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - openedAt
      setRemaining(Math.max(0, 1 - elapsed / timeoutMs))
    }
    tick()
    const t = setInterval(tick, 250)
    return () => clearInterval(t)
  }, [openedAt, timeoutMs])
  return remaining
}

export default function RollOverlay({
  window: win,
  rollerName,
  hero,
  hand,
  cardOf,
  onPlayModifier,
  onSkip,
}: RollOverlayProps) {
  const remaining = useCountdown(win.openedAt, win.timeoutMs)
  const showTimer = win.timeoutMs > 0 && win.timeoutMs < 10 * 60 * 1000

  const modifiers = hand
    .map((id) => cardOf(id))
    .filter((c): c is CardData => !!c && c.type === 'Modifier')

  const delta = win.finalRoll - win.baseRoll

  // Hero-effect rolls carry a rollReq; monster attacks resolve against the
  // monster's own thresholds (mirrors the engine's trySlay logic).
  let verdict: { text: string; good: boolean } | null = null
  if (win.rollReq != null) {
    const ok = win.finalRoll >= win.rollReq
    verdict = {
      text: `needs ${win.rollReq}+ · ${ok ? 'succeeding' : 'failing'}`,
      good: ok,
    }
  } else if (hero?.type === 'Monster' && hero.higherReq != null && hero.lowerReq != null) {
    const lowToWin = hero.rollCompareMode === 'LowToWin'
    const roll = win.finalRoll
    const slaying = lowToWin ? roll <= hero.higherReq : roll >= hero.higherReq
    const fightBack = lowToWin ? roll >= hero.lowerReq : roll <= hero.lowerReq
    verdict = slaying
      ? { text: `slay on ${hero.higherReq}${lowToWin ? '−' : '+'} · monster slain!`, good: true }
      : fightBack
        ? { text: `${hero.lowerReq}${lowToWin ? '+' : '−'} · the monster fights back!`, good: false }
        : { text: 'a miss — nothing happens', good: false }
  }

  return (
    <div className="roll-overlay" role="dialog" aria-modal="true" aria-label="Dice roll in progress">
      <div className="roll-panel">
        <h2 className="panel-title">
          {rollerName} rolled
          {hero ? ` ${hero.type === 'Monster' ? 'against' : 'for'} ${hero.name}` : ''}
        </h2>

        <div className="roll-readout">
          <span className="roll-figure">
            <span className="roll-figure-num">{win.baseRoll}</span>
            <span className="roll-figure-label">base roll</span>
          </span>
          {delta !== 0 && (
            <span className="roll-figure roll-figure-mod">
              <span className="roll-figure-num">
                {delta > 0 ? `+${delta}` : delta}
              </span>
              <span className="roll-figure-label">modifiers</span>
            </span>
          )}
          <span className="roll-figure roll-figure-total">
            <span className="roll-figure-num">{win.finalRoll}</span>
            <span className="roll-figure-label">total</span>
          </span>
          {verdict && (
            <span
              className={`roll-verdict ${verdict.good ? 'roll-verdict-good' : 'roll-verdict-bad'}`}
              role="status"
            >
              {verdict.text}
            </span>
          )}
        </div>

        <div className="roll-modifiers">
          <span className="zone-caption">
            {modifiers.length > 0
              ? 'Play a modifier (no action cost)'
              : 'No modifier cards in your hand'}
          </span>
          <div className="roll-modifier-row">
            {modifiers.map((card) => (
              <div key={card.id} className="roll-modifier">
                <CardFrame card={card} size="sm" />
                <div className="roll-modifier-values">
                  {(card.values ?? []).map((v) => (
                    <Tooltip key={v} text={`Apply ${v > 0 ? `+${v}` : v} to the roll`}>
                      <button
                        className="btn btn-small"
                        onClick={() => onPlayModifier({ cardId: card.id, value: v })}
                      >
                        {v > 0 ? `+${v}` : v}
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="roll-footer">
          {showTimer && (
            <span className="roll-timer" aria-hidden="true">
              <span className="roll-timer-fill" style={{ transform: `scaleX(${remaining})` }} />
            </span>
          )}
          <button className="btn btn-gold" onClick={onSkip}>
            Let it stand
          </button>
        </div>
      </div>
    </div>
  )
}
