import React from 'react'
import { HUD, HUD_ASPECT, MODIFIER_LAYOUT } from './layout'
import { artFor, NONHERO_CARD_ASPECT } from './assets'
import { LiveRoll, rollNeedLabel, rollOutcome } from './liveRoll'
import { useTargetable } from './targeting'
import { useGameView } from '../state/game'
import { cardById, targetKeyForId } from './viewTargets'
import CardReactionTimer from './CardReactionTimer'

/**
 * ModifierWindow — the roll being modified, centre stage, the way a
 * challenge takes the stage in ChallengeWindow: the card rolled on (a hero,
 * a leader, a monster under attack) in the middle with the roll's TOTAL in
 * the scroll under it, and every modifier card played onto the roll beside
 * it — the first to the right, the second to the left, the third to the
 * right again, and so on (the owner, 2026-09-05). Opens once a modifier
 * CARD has landed (standing bonuses alone do not open it); the board below
 * is dimmed like a challenge (`.challenge-open`), the local hand stays on
 * the bright layer, and the centre card is the modifier target, so aiming
 * another modifier works from here. A click on the shield puts the window
 * away; the window button beside the discard pile brings it back.
 */
export default function ModifierWindow({
  roll,
  hidden = false,
  onHide,
}: {
  roll: LiveRoll | null
  hidden?: boolean
  onHide?: () => void
}) {
  const view = useGameView()
  const subject = cardById(view, roll?.subjectId)
  const subjectKey = targetKeyForId(view, roll?.subjectId) ?? undefined
  // The overlay's card answers to the SAME key as the card on the board, so
  // a modifier aimed at the roll lands whichever one is pressed.
  const target = useTargetable(subjectKey)
  if (!roll || hidden || !subject) return null

  const L = MODIFIER_LAYOUT
  const art = artFor(subject)
  const outcome = rollOutcome(roll, view)
  const roller = view.seats.find((seat) => seat.playerId === roll.rollerId)
  const who = roll.rollerId === view.playerId ? 'you' : roller?.name ?? 'player'
  const modifierCards = roll.bonuses.flatMap((bonus) => {
    const card = cardById(view, bonus.cardSource)
    return card?.type === 'Modifier' ? [{ card, amount: bonus.amount }] : []
  })

  return (
    <div className="dim-exempt pointer-events-none absolute inset-0 z-[140]">
      <div
        className="pointer-events-auto absolute inset-0"
        onClick={(event) => {
          event.stopPropagation()
          onHide?.()
        }}
      />

      <div
        className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
        style={{
          height: `${L.card.h}cqh`,
          width: `${L.card.h * art.aspect}cqh`,
          left: `calc(50% + ${L.card.dx}cqh)`,
          top: `calc(50% + ${L.card.dy}cqh)`,
        }}
      >
        <div className="challenge-pop relative h-full w-full">
          <div
            className="absolute inset-x-0 -top-[4.5cqh] text-center font-heading text-[1.1cqw] uppercase tracking-[0.15cqw] text-amber-200"
          >
            {who} {roll.type === 'Attack' ? 'attack' : 'roll'}
          </div>
          <img
            src={art.url}
            alt={subject.name}
            draggable={false}
            className={`absolute inset-0 h-full w-full select-none rounded-[0.5cqw] object-fill shadow-[0.3cqw_0.6cqw_1.8cqw_rgba(0,0,0,0.85)] ${target.className}`}
            onClick={target.onClick}
          />
          <CardReactionTimer cardId={subject.id} />
        </div>

        {/* each modifier played onto the roll: right, left, right, left… */}
        {modifierCards.map(({ card, amount }, index) => {
          const side = index % 2 === 0 ? 1 : -1
          const rank = Math.floor(index / 2)
          return (
            <div
              key={`${card.id}-${index}`}
              className="challenge-pop absolute"
              style={{
                height: `${L.modCard.h}cqh`,
                width: `${L.modCard.h * NONHERO_CARD_ASPECT}cqh`,
                left: `calc(50% + ${side * (L.modCard.dx + rank * L.modCard.step)}cqh)`,
                top: `calc(50% + ${L.modCard.dy + rank * L.modCard.drop}cqh)`,
                transform: `translate(-50%, -50%) rotate(${side * L.modCard.angle}deg)`,
                zIndex: 10 - rank,
              }}
            >
              <img
                src={artFor(card).url}
                alt={`modifier ${amount > 0 ? '+' : ''}${amount}`}
                draggable={false}
                className="h-full w-full select-none rounded-[0.4cqw] object-fill shadow-[0.2cqw_0.4cqw_1cqw_rgba(0,0,0,0.75)]"
              />
              <span
                className="absolute left-1/2 top-full mt-[0.4cqh] -translate-x-1/2 whitespace-nowrap font-heading text-[1cqw] text-amber-100 drop-shadow-[0_0.1cqw_0.2cqw_rgba(0,0,0,0.9)]"
              >
                {amount > 0 ? '+' : '−'}{Math.abs(amount)}
              </span>
            </div>
          )
        })}
      </div>

      {/* the roll as it stands — the total, coloured by what it means */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{
          height: `${L.scroll.h}cqh`,
          width: `${L.scroll.h * HUD_ASPECT.yourTurn}cqh`,
          left: `calc(50% + ${L.scroll.dx}cqh)`,
          top: `calc(50% + ${L.scroll.dy}cqh)`,
        }}
      >
        <img
          src={HUD.yourTurn}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
        />
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap leading-none drop-shadow-[0_0.08cqw_0.15cqw_rgba(0,0,0,0.9)]"
          style={{
            fontFamily: "'Alfa Slab One', serif",
            fontSize: `${L.scroll.h * 0.3}cqh`,
            color: outcome === 'success' ? '#86efac' : outcome === 'failure' ? '#fca5a5' : '#f5b03e',
          }}
        >
          {roll.finalRoll}
        </span>
        <span className="absolute inset-x-0 top-full mt-[0.3cqh] text-center font-heading text-[0.75cqw] text-amber-100/80">
          {rollNeedLabel(roll, view)}
        </span>
      </div>
    </div>
  )
}
