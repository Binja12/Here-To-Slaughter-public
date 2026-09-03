import { useEffect, useRef } from 'react'
import type { PlayerView } from '../contract'
import { artFor, boardChallengeUrl } from './assets'
import { ChallengeRole, useChallenge } from './challenge'
import { bonusesOf, bonusTotal, facesOf, RollBonusView } from './liveRoll'
import { slotForPlayer } from './seats'
import { cardById } from './viewTargets'

/**
 * A challenge that has been STARTED — somebody played a challenge card and
 * both sides have rolled — read off the server's Challenge window. Before
 * that the window only says the card may still be challenged, and the
 * board shows it as a glowing target instead of opening the overlay.
 */
export type LiveChallenge = {
  windowId: string
  cardId?: string
  defenderId: string
  challengerId: string
  challengerRoll: number
  challengedRoll: number
  challengerBonuses: RollBonusView[]
  challengedBonuses: RollBonusView[]
}

const str = (value: unknown) => (typeof value === 'string' ? value : undefined)
const num = (value: unknown) => (typeof value === 'number' ? value : 0)

export function liveChallengeOf(view: PlayerView): LiveChallenge | null {
  const window = view.pendingWindows.find(
    (candidate) =>
      candidate.type === 'Challenge' && candidate.detail?.challenged === true,
  )
  if (!window?.detail) return null
  const detail = window.detail
  return {
    windowId: window.windowId,
    cardId: window.cardId ?? str(detail.cardId),
    defenderId: str(detail.defenderId) ?? window.respondentId,
    challengerId: str(detail.challengerId) ?? '',
    challengerRoll: num(detail.challengerRoll),
    challengedRoll: num(detail.challengedRoll),
    challengerBonuses: bonusesOf(detail.challengerBonuses),
    challengedBonuses: bonusesOf(detail.challengedBonuses),
  }
}

/**
 * Drives the challenge overlay (challenge.tsx) from the view, 1:1 with what
 * the old demo did by hand: a started challenge opens it with both rolls,
 * a bonus that grows lands a modifier card on that side, and the window
 * closing closes it. Returns the live challenge so the board can aim
 * modifiers at the two roll panels.
 */
export function useChallengeSync(view: PlayerView): LiveChallenge | null {
  const challenge = useChallenge()
  const live = liveChallengeOf(view)
  const opened = useRef<{
    windowId: string
    totals: Record<ChallengeRole, number>
  } | null>(null)

  const windowId = live?.windowId ?? null
  const challengerTotal = live ? bonusTotal(live.challengerBonuses) : 0
  const challengedTotal = live ? bonusTotal(live.challengedBonuses) : 0

  useEffect(() => {
    if (!live) {
      if (opened.current) {
        opened.current = null
        challenge.close()
      }
      return
    }

    if (opened.current?.windowId !== live.windowId) {
      const card = cardById(view, live.cardId)
      const art = card ? artFor(card) : null
      challenge.open({
        challengedCardUrl: art?.url ?? '/cards/magic.png',
        challengedCardAspect: art?.aspect,
        challengeCardUrl: boardChallengeUrl(),
        challengedSeat: slotForPlayer(view, live.defenderId) ?? 'p2',
        challengerSeat: slotForPlayer(view, live.challengerId) ?? 'p1',
      })
      challenge.setRoll(
        'challenged',
        facesOf(live.challengedRoll, `${live.windowId}:defender`),
        challengedTotal === 0 ? null : challengedTotal,
      )
      challenge.setRoll(
        'challenger',
        facesOf(live.challengerRoll, `${live.windowId}:challenger`),
        challengerTotal === 0 ? null : challengerTotal,
      )
      opened.current = {
        windowId: live.windowId,
        totals: { challenged: challengedTotal, challenger: challengerTotal },
      }
      return
    }

    const totals = opened.current.totals
    const landed = (role: ChallengeRole, total: number, bonuses: RollBonusView[]) => {
      if (total === totals[role]) return
      const last = bonuses[bonuses.length - 1]
      const card = last ? cardById(view, last.cardSource) : undefined
      challenge.addModifier(
        role,
        total - totals[role],
        card ? artFor(card).url : '/cards/modifier.png',
      )
      totals[role] = total
    }
    landed('challenged', challengedTotal, live.challengedBonuses)
    landed('challenger', challengerTotal, live.challengerBonuses)
    // The three primitives are what can change between snapshots; `view`
    // and `live` are re-read from the render that changed them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowId, challengerTotal, challengedTotal])

  return live
}
