import { useEffect, useRef } from 'react'
import type { PlayerView } from '../contract'
import { artFor, boardChallengeUrl, SMALL_BACK } from './assets'
import { ChallengeRole, useChallenge } from './challenge'
import { bonusesOf, facesOf, RollBonusView } from './liveRoll'
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
 * Drives the challenge overlay (challenge.tsx) from the view: a started
 * challenge opens it with both rolls and whatever was already modifying
 * them (a leader's, a monster's, a hero's standing bonus — the owner,
 * 2026-09-06: every effect on a roll is shown beside it, like a card), each
 * later bonus lands as one more source on that side, and the window closing
 * closes it. Returns the live challenge so the board can aim modifiers at
 * the two roll panels.
 */
export function useChallengeSync(view: PlayerView): LiveChallenge | null {
  const challenge = useChallenge()
  const live = liveChallengeOf(view)
  const opened = useRef<{
    windowId: string
    shown: Record<ChallengeRole, number>
  } | null>(null)

  const windowId = live?.windowId ?? null
  const challengerCount = live?.challengerBonuses.length ?? 0
  const challengedCount = live?.challengedBonuses.length ?? 0

  useEffect(() => {
    if (!live) {
      if (opened.current) {
        opened.current = null
        challenge.close()
      }
      return
    }
    const sourceArt = (bonus: RollBonusView) => {
      const card = cardById(view, bonus.cardSource)
      return card ? artFor(card).url : SMALL_BACK
    }

    if (opened.current?.windowId !== live.windowId) {
      const card = cardById(view, live.cardId)
      const art = card ? artFor(card) : null
      challenge.open({
        challengedCardUrl: art?.url ?? SMALL_BACK,
        challengedCardAspect: art?.aspect,
        challengeCardUrl: boardChallengeUrl(),
        challengedSeat: slotForPlayer(view, live.defenderId) ?? 'p2',
        challengerSeat: slotForPlayer(view, live.challengerId) ?? 'p1',
      })
      challenge.setRoll(
        'challenged',
        facesOf(live.challengedRoll, `${live.windowId}:defender`),
        live.challengedBonuses.map((bonus) => ({ url: sourceArt(bonus), amount: bonus.amount })),
      )
      challenge.setRoll(
        'challenger',
        facesOf(live.challengerRoll, `${live.windowId}:challenger`),
        live.challengerBonuses.map((bonus) => ({ url: sourceArt(bonus), amount: bonus.amount })),
      )
      opened.current = {
        windowId: live.windowId,
        shown: { challenged: challengedCount, challenger: challengerCount },
      }
      return
    }

    const shown = opened.current.shown
    const landed = (role: ChallengeRole, bonuses: RollBonusView[]) => {
      for (const bonus of bonuses.slice(shown[role])) {
        challenge.addModifier(role, bonus.amount, sourceArt(bonus))
      }
      shown[role] = bonuses.length
    }
    landed('challenged', live.challengedBonuses)
    landed('challenger', live.challengerBonuses)
    // The three primitives are what can change between snapshots; `view`
    // and `live` are re-read from the render that changed them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowId, challengerCount, challengedCount])

  return live
}
