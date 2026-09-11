import React from 'react'
import { render } from '@testing-library/react'
import ModifierWindow from './ModifierWindow'
import { GameProvider } from '../state/game'
import { TargetingProvider } from './targeting'
import { threeSeatOpening } from '../fixtures/views'
import { INSET, MODIFIER_LAYOUT, PLAYERS } from './layout'
import { CARD_H_CQH } from './PlayerHand'
import type { CardView, PlayerView } from '../contract'
import type { LiveRoll } from './liveRoll'

// The bonus cards fan out from the card in the middle: everything that ADDS
// to the left, everything that SUBTRACTS to the right, each side stepping
// outward from the centre. Each one is CENTRED on its computed point, and the
// entrance animation must not be what carries that centring: `challenge-pop`
// animates `transform`, so putting it on the positioned element itself wiped
// the `translate(-50%, -50%)` and slid every card half its own width to the
// right — which buried the LEFT half of the fan under the card in the middle
// (the owner reported the left modifiers four times before this was found).

const bonusCards: CardView[] = threeSeatOpening.hand.slice(0, 4)

const view: PlayerView = {
  ...threeSeatOpening,
  parties: threeSeatOpening.parties.map((party, index) =>
    index === 0 ? { ...party, instanceCards: bonusCards } : party,
  ),
}

const roll: LiveRoll = {
  windowId: 'window-modifier',
  type: 'Modifier',
  rollerId: view.playerId,
  baseRoll: 7,
  // two that add and two that take away, interleaved, so the render has to
  // SORT them rather than take them in the order they arrived
  bonuses: bonusCards.map((card, index) => ({
    cardSource: card.id,
    amount: index % 2 === 0 ? index + 1 : -(index + 1),
  })),
  finalRoll: 17,
  rollReq: 9,
  subjectId: view.parties[0].leader.id,
  targetPlayerIds: [],
}

const modifierWindow = () =>
  render(
    <GameProvider view={view}>
      <TargetingProvider>
        <ModifierWindow roll={roll} />
      </TargetingProvider>
    </GameProvider>,
  )

/** The positioned wrapper of each bonus card: img → `challenge-pop` → box. */
const boxes = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('img[alt^="roll bonus"]')).map(
    (image) => image.parentElement!.parentElement! as HTMLElement,
  )

test('every modifier card is centred on its own point, and the entrance rides an inner wrapper', () => {
  const { container } = modifierWindow()
  const cards = boxes(container)
  expect(cards).toHaveLength(4)

  for (const card of cards) {
    // the centring translate survives to the rendered element…
    expect(card.style.transform).toContain('translate(-50%, -50%)')
    // …because the animation is not on it
    expect(card).not.toHaveClass('challenge-pop')
    expect(card.firstElementChild).toHaveClass('challenge-pop')
  }
})

test('adds fan out to the left, subtracts to the right, each stepping outward', () => {
  const { container } = modifierWindow()
  const { dx, step, angle } = MODIFIER_LAYOUT.modCard
  const cards = boxes(container)

  // the two that add first (left, negative offsets), then the two that
  // subtract (right) — whatever order the bonuses arrived in
  expect(cards.map((card) => card.style.left)).toEqual([
    `calc(50% + ${-dx}cqh)`,
    `calc(50% + ${-(dx + step)}cqh)`,
    `calc(50% + ${dx}cqh)`,
    `calc(50% + ${dx + step}cqh)`,
  ])
  // mirrored, so the left half of the fan is the right half's reflection
  expect(cards.map((card) => card.style.transform)).toEqual([
    `translate(-50%, -50%) rotate(${-angle}deg)`,
    `translate(-50%, -50%) rotate(${-angle}deg)`,
    `translate(-50%, -50%) rotate(${angle}deg)`,
    `translate(-50%, -50%) rotate(${angle}deg)`,
  ])
})

/**
 * The top edge of the local hand's fan, in stage cqh — derived, not guessed:
 * the cardback widget's centre sits `100 - dy` from the stage top with a
 * `-translate-y-1/2`, its inner window is `INSET.cardback.h` of that, and the
 * fan is anchored `bottom-[12%]` inside it (PlayerHand.tsx) at CARD_H_CQH tall.
 */
const FAN_ANCHOR_BOTTOM_PCT = 0.12
const slot = PLAYERS.p1.cardback
const slotCentre = 100 - slot.dy
const innerHeight = slot.h * INSET.cardback.h
const innerBottom = slotCentre + innerHeight / 2
const FAN_TOP = innerBottom - innerHeight * FAN_ANCHOR_BOTTOM_PCT - CARD_H_CQH

// An OPEN hand paints at z-170 over this window's z-140 — the owner's rule
// (2026-09-06) that an opened hand sits over everything. So every piece of the
// window has to live above the fan's top edge, or it disappears exactly when
// the player opens their hand to choose a modifier (the owner, 2026-09-07).
test('every piece of the window stays clear of the hand fan', () => {
  const L = MODIFIER_LAYOUT
  const bottomOf = (piece: { h: number; dy: number }) => 50 + piece.dy + piece.h / 2

  expect(FAN_TOP).toBeCloseTo(65.6, 1)
  expect(bottomOf(L.card)).toBeLessThan(FAN_TOP)
  // the scroll carries its need-label underneath it, so leave it room
  expect(bottomOf(L.scroll) + 2).toBeLessThan(FAN_TOP)
  expect(bottomOf(L.skip)).toBeLessThan(FAN_TOP)
  // …and the pieces still read top-to-bottom: card, then the total under it
  expect(bottomOf(L.card)).toBeLessThanOrEqual(50 + L.scroll.dy - L.scroll.h / 2)
})
