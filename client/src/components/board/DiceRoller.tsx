import React, { useEffect, useRef, useState } from 'react'
import Card from '../Card'
import { CardData, ModifierWindowDto } from '../../types'
import './board.css'

/**
 * The dice / modifier reaction window: the die tumbles briefly, settles on
 * the base roll, then modifiers land on the running total until the timer
 * (or "Resolve now") settles the outcome.
 */
export default function DiceRoller(props: {
  window: ModifierWindowDto
  hand: string[]
  cardOf: (id: string) => CardData | undefined
  onPlay: (dto: { cardId: string; value: number }) => void
  onSkip: () => void
}) {
  const { window: win } = props
  const [remainingMs, setRemainingMs] = useState(win.timeoutMs)
  const [dieFace, setDieFace] = useState<number>(win.baseRoll)
  const [rolling, setRolling] = useState(true)
  const receivedAtRef = useRef(Date.now())

  // countdown — resets whenever the server timer resets (openedAt changes)
  useEffect(() => {
    receivedAtRef.current = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - receivedAtRef.current
      setRemainingMs(Math.max(0, win.timeoutMs - elapsed))
    }, 100)
    return () => clearInterval(interval)
  }, [win.openedAt, win.timeoutMs])

  // brief tumble on open, then settle on the base roll
  useEffect(() => {
    setRolling(true)
    const tumble = setInterval(() => {
      setDieFace(1 + Math.floor(Math.random() * 12))
    }, 70)
    const settle = setTimeout(() => {
      clearInterval(tumble)
      setDieFace(win.baseRoll)
      setRolling(false)
    }, 650)
    return () => {
      clearInterval(tumble)
      clearTimeout(settle)
    }
  }, [win.baseRoll])

  const modifiers = props.hand
    .map((id) => props.cardOf(id))
    .filter((c): c is CardData => !!c && c.type === 'Modifier')

  const bonus = win.finalRoll - win.baseRoll
  const success = win.rollReq === undefined || win.finalRoll >= win.rollReq

  return (
    <div className="dice-overlay">
      <div className="dice-panel">
        <div className={`die ${rolling ? 'die-rolling' : ''}`}>
          <span className="die-face">{dieFace}</span>
        </div>

        <div className="dice-total-row">
          {!rolling && bonus !== 0 && (
            <span className="dice-bonus">{bonus > 0 ? `+${bonus}` : bonus}</span>
          )}
          <span
            className={`dice-total ${
              rolling ? '' : success ? 'dice-total-ok' : 'dice-total-bad'
            }`}
          >
            {rolling ? '…' : win.finalRoll}
          </span>
          {win.rollReq !== undefined && (
            <span className="dice-req">needs {win.rollReq}+</span>
          )}
        </div>

        <div className="dice-timer">
          <div
            className="dice-timer-fill"
            style={{ width: `${(remainingMs / win.timeoutMs) * 100}%` }}
          />
        </div>

        <div className="dice-modifiers">
          {modifiers.length === 0 && (
            <span className="dice-none">No modifier cards in hand</span>
          )}
          {modifiers.map((card) => (
            <div key={card.id} className="dice-modifier-choice">
              <Card card={card} size="sm" />
              <div className="dice-modifier-values">
                {card.values?.map((v) => (
                  <button
                    key={v}
                    onClick={() => props.onPlay({ cardId: card.id, value: v })}
                  >
                    {v > 0 ? `+${v}` : v}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button className="dice-skip" onClick={props.onSkip}>
          Resolve now
        </button>
      </div>
    </div>
  )
}
