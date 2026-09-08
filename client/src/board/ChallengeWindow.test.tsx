import React from 'react'
import { render, screen } from '@testing-library/react'
import ChallengeWindow from './ChallengeWindow'
import { ChallengeProvider, useChallenge } from './challenge'
import { TargetingProvider } from './targeting'
import { CHALLENGE_LAYOUT } from './layout'
import type { PlayerId } from './layout'

// The owner, 2026-09-07: whichever side is MINE takes the left panel, so the
// window always reads the same way round. The viewer is seated at p1
// (seats.ts). The aura colour stays with the ROLE — green defends, red
// contests — but only the side that is AHEAD wears one at all (the owner,
// 2026-09-08), so the window says who is winning without being read.

// a rolled side draws real dice, and the dice animate — jsdom has no
// Element.animate
const originalAnimate = Element.prototype.animate
beforeEach(() => {
  Element.prototype.animate = jest.fn(() => ({
    cancel: jest.fn(),
  })) as unknown as typeof Element.prototype.animate
})
afterEach(() => {
  Element.prototype.animate = originalAnimate
})

function Open({
  challengedSeat,
  challengerSeat,
  rolls,
}: {
  challengedSeat: PlayerId
  challengerSeat: PlayerId
  /** each side's 2d6, when the test cares who is ahead */
  rolls?: { challenged: [number, number]; challenger: [number, number] }
}) {
  const challenge = useChallenge()
  React.useEffect(() => {
    challenge.open({
      challengedCardUrl: 'card.png',
      challengeCardUrl: 'challenge.png',
      challengedSeat,
      challengerSeat,
    })
    if (rolls) {
      challenge.setRoll('challenged', rolls.challenged)
      challenge.setRoll('challenger', rolls.challenger)
    }
    // one open per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <ChallengeWindow />
}

const window_ = (
  challengedSeat: PlayerId,
  challengerSeat: PlayerId,
  rolls?: { challenged: [number, number]; challenger: [number, number] },
) =>
  render(
    <TargetingProvider>
      <ChallengeProvider>
        <Open challengedSeat={challengedSeat} challengerSeat={challengerSeat} rolls={rolls} />
      </ChallengeProvider>
    </TargetingProvider>,
  )

/** one side's panel, and which half of the stage it sits on */
const panelOf = (role: string) => {
  const panel = document.querySelector(`[data-role="${role}"]`) as HTMLElement
  return {
    onLeft: panel.style.left.includes(`-${CHALLENGE_LAYOUT.panel.dx}cqh`),
    green: panel.className.includes('challenge-glow-green'),
    red: panel.className.includes('challenge-glow-red'),
  }
}

test('the viewer takes the left panel when they are the CHALLENGED', () => {
  window_('p1', 'p2')
  expect(panelOf('challenged').onLeft).toBe(true)
  expect(panelOf('challenger').onLeft).toBe(false)
})

test('the viewer takes the left panel when they are the CHALLENGER too', () => {
  window_('p2', 'p1')
  expect(panelOf('challenger').onLeft).toBe(true)
  expect(panelOf('challenged').onLeft).toBe(false)
})

test('a challenge the viewer is not in keeps the roles in their own order', () => {
  window_('p2', 'p3')
  expect(panelOf('challenged').onLeft).toBe(true)
  expect(panelOf('challenger').onLeft).toBe(false)
})

test('only the side that is AHEAD glows, and its colour follows the ROLE', () => {
  // the viewer is the challenger and now sits left — red when ahead, and
  // the side that is behind carries no glow at all
  window_('p2', 'p1', { challenged: [2, 2], challenger: [5, 6] })
  expect(panelOf('challenger')).toMatchObject({ onLeft: true, red: true, green: false })
  expect(panelOf('challenged')).toMatchObject({ onLeft: false, green: false, red: false })
})

test('the defender ahead glows green, and a level challenge glows on neither side', () => {
  const { unmount } = window_('p1', 'p2', { challenged: [6, 6], challenger: [1, 1] })
  expect(panelOf('challenged')).toMatchObject({ green: true, red: false })
  expect(panelOf('challenger')).toMatchObject({ green: false, red: false })
  unmount()

  window_('p1', 'p2', { challenged: [3, 4], challenger: [4, 3] })
  expect(panelOf('challenged')).toMatchObject({ green: false, red: false })
  expect(panelOf('challenger')).toMatchObject({ green: false, red: false })
})
