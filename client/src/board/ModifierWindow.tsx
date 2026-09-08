import AssetImage from '../loading/AssetImage'
import React from 'react'
import { HUD, HUD_ASPECT, MODIFIER_LAYOUT } from './layout'
import { artFor, boardModifierUrl, NONHERO_CARD_ASPECT } from './assets'
import { LiveRoll, rollNeedLabel, rollOutcome } from './liveRoll'
import { useTargetable } from './targeting'
import { useGameView } from '../state/game'
import { cardById, targetKeyForId } from './viewTargets'
import { nameOf } from './seats'
import CardReactionTimer from './CardReactionTimer'
import ImageButton from './ImageButton'

/**
 * ModifierWindow — the roll being modified, centre stage, the way a
 * challenge takes the stage in ChallengeWindow: the card rolled on (a hero,
 * a leader, a monster under attack) in the middle with the roll's TOTAL in
 * the scroll under it, and every modifier card played onto the roll beside
 * it — the ones that ADD on the left, the ones that SUBTRACT on the right
 * (the owner, 2026-09-08). A challenge window sides its cards by whose roll
 * they landed on; a modifier window has only the one roll, so the side is
 * free to say the sign instead. Opens once ANYTHING is
 * modifying the roll — a card played onto it or a standing effect (a
 * leader, a monster, a hero; the owner, 2026-09-06), every source shown
 * with its amount; the board below
 * is dimmed like a challenge (`.challenge-open`), the local hand stays on
 * the bright layer, and the centre card is the modifier target, so aiming
 * another modifier works from here. A click on the shield puts the window
 * away; the window button beside the discard pile brings it back.
 */
export default function ModifierWindow({
  roll,
  hidden = false,
  onHide,
  canSkip = false,
  onSkip,
}: {
  roll: LiveRoll | null
  hidden?: boolean
  onHide?: () => void
  /** whether this seat may still give the roll up — the Skip button lights while it can */
  canSkip?: boolean
  onSkip?: () => void
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
  const who = nameOf(view, roll.rollerId)
  // every seat the roll is aimed at, not just the first: one card may choose
  // two (Fluffy), and both need to read their own name here
  const targetName = roll.targetPlayerIds.length
    ? roll.targetPlayerIds.map((playerId) => nameOf(view, playerId)).join(' + ')
    : undefined
  const bonusCards = roll.bonuses.flatMap((bonus) => {
    const card = cardById(view, bonus.cardSource)
    return card ? [{ card, amount: bonus.amount }] : []
  })
  // side -1 is the left fan (adds), +1 the right (subtracts); rank counts
  // outward from the centre card within each side.
  const placed = [
    ...bonusCards
      .filter((bonus) => bonus.amount > 0)
      .map((bonus, rank) => ({ ...bonus, side: -1, rank })),
    ...bonusCards
      .filter((bonus) => bonus.amount <= 0)
      .map((bonus, rank) => ({ ...bonus, side: 1, rank })),
  ]

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
          {/* the two lines over the card, big enough to read across the
              table (the owner, 2026-09-07) */}
          {/* wider than the card and never wrapped: a long name would break
              "MIRA ATTACK" across two lines inside the card's own width */}
          <div
            className="absolute left-1/2 -top-[7.5cqh] -translate-x-1/2 whitespace-nowrap text-center font-heading text-[1.9cqw] uppercase tracking-[0.2cqw] text-amber-200 drop-shadow-[0_0.12cqw_0.25cqw_rgba(0,0,0,0.9)]"
          >
            {who} {roll.type === 'Attack' ? 'attack' : 'roll'}
          </div>
          {targetName && (
            <div className="absolute left-1/2 -top-[3.9cqh] -translate-x-1/2 whitespace-nowrap text-center font-heading text-[1.35cqw] uppercase tracking-[0.12cqw] text-red-300 drop-shadow-[0_0.1cqw_0.2cqw_rgba(0,0,0,0.9)]">
              target: {targetName}
            </div>
          )}
          <AssetImage
            src={art.url}
            alt={subject.name}
            draggable={false}
            className={`absolute inset-0 h-full w-full select-none rounded-[0.5cqw] object-fill shadow-[0.3cqw_0.6cqw_1.8cqw_rgba(0,0,0,0.85)] ${target.className}`}
            onClick={target.onClick}
          />
          <CardReactionTimer cardId={subject.id} />
        </div>

        {/* everything modifying the roll: adds left, subtracts right */}
        {placed.map(({ card, amount, side, rank }) => {
          // A modifier card that offered a choice (+1/-3) shows the value
          // that was CHOSEN, not the two-sided card — the window has to say
          // what actually landed (the owner, 2026-09-08). A standing effect
          // (a leader, a monster, a hero) keeps its own art.
          const url =
            card.type === 'Modifier' && amount !== 0
              ? boardModifierUrl(amount > 0 ? `+${amount}` : `${amount}`)
              : artFor(card).url
          return (
            <div
              key={`${card.id}-${side}-${rank}`}
              className="absolute"
              style={{
                height: `${L.modCard.h}cqh`,
                width: `${L.modCard.h * NONHERO_CARD_ASPECT}cqh`,
                left: `calc(50% + ${side * (L.modCard.dx + rank * L.modCard.step)}cqh)`,
                top: `calc(50% + ${L.modCard.dy + rank * L.modCard.drop}cqh)`,
                // the card is CENTRED on that point and leans away from the
                // middle — mirrored per side, so the left fan is the right
                // fan's reflection
                transform: `translate(-50%, -50%) rotate(${side * L.modCard.angle}deg)`,
                zIndex: 10 - rank,
              }}
            >
              {/* the entrance lives on an INNER wrapper, the way the challenge
                  window's pieces do: `challenge-pop` animates `transform`, so
                  on the positioned element itself it wiped the centring
                  translate above and every card sat half a width to the right
                  of where it belongs — which put the LEFT fan under the card
                  in the middle (the owner, four times) */}
              <div className="challenge-pop relative h-full w-full">
                <AssetImage
                  src={url}
                  alt={`roll bonus ${amount > 0 ? '+' : ''}${amount}`}
                  draggable={false}
                  className="h-full w-full select-none rounded-[0.4cqw] object-fill shadow-[0.2cqw_0.4cqw_1cqw_rgba(0,0,0,0.75)]"
                />
                <span
                  className="absolute left-1/2 top-full mt-[0.4cqh] -translate-x-1/2 whitespace-nowrap font-heading text-[1.5cqw] text-amber-100 drop-shadow-[0_0.1cqw_0.2cqw_rgba(0,0,0,0.9)]"
                >
                  {amount > 0 ? '+' : '−'}{Math.abs(amount)}
                </span>
              </div>
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
        {/* the scroll itself glows with what the number means: green over
            the mark, red under it, nothing in a monster's middle band */}
        <AssetImage
          src={HUD.yourTurn}
          alt=""
          aria-hidden
          draggable={false}
          className={`pointer-events-none absolute inset-0 h-full w-full select-none object-fill${
            outcome === 'success' ? ' card-aura' : outcome === 'failure' ? ' enemy-aura' : ''
          }`}
        />
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap leading-none drop-shadow-[0_0.08cqw_0.15cqw_rgba(0,0,0,0.9)]"
          style={{
            fontFamily: "'Alfa Slab One', serif",
            fontSize: `${L.scroll.h * 0.42}cqh`,
            color: outcome === 'success' ? '#86efac' : outcome === 'failure' ? '#fca5a5' : '#f5b03e',
          }}
        >
          {roll.finalRoll}
        </span>
        <span className="absolute inset-x-0 top-full mt-[0.4cqh] whitespace-nowrap text-center font-heading text-[1.3cqw] uppercase tracking-[0.08cqw] text-amber-100 drop-shadow-[0_0.1cqw_0.2cqw_rgba(0,0,0,0.9)]">
          {rollNeedLabel(roll, view)}
        </span>
      </div>

      {/* the same Skip as the HUD slot, here where the roll is, so it is
          plain that this window can be given up (the owner, 2026-09-06) */}
      {onSkip && (
        <div
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            height: `${L.skip.h}cqh`,
            width: `${L.skip.h * 3}cqh`,
            left: `calc(50% + ${L.skip.dx}cqh)`,
            top: `calc(50% + ${L.skip.dy}cqh)`,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <ImageButton src={HUD.skipReaction} label="Skip reaction" enabled={canSkip} glow={canSkip} onClick={onSkip} />
        </div>
      )}
    </div>
  )
}
