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
  /** false while the play is only contestable — no challenger, no rolls yet */
  started: boolean
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
  // A started challenge wins: it is the one with rolls to show. Otherwise the
  // window is a play still open to contest, and the overlay shows the card by
  // itself — the only way an ITEM tucked behind its hero can be seen at all
  // (the owner, 2026-09-07).
  const window =
    view.pendingWindows.find(
      (candidate) =>
        candidate.type === 'Challenge' && candidate.detail?.challenged === true,
    ) ??
    view.pendingWindows.find(
      (candidate) => candidate.type === 'Challenge' && !!candidate.cardId,
    )
  if (!window?.detail) return null
  const detail = window.detail
  return {
    windowId: window.windowId,
    started: detail.challenged === true,
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
    started: boolean
    shown: Record<ChallengeRole, number>
  } | null>(null)

  const windowId = live?.windowId ?? null
  const started = live?.started ?? false
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
      // An item is equipped BEFORE its challenge opens, so the hero it went
      // onto is already in the view — no server field needed, the party walk
      // is the same reverse lookup viewTargets.ts does for an item's key.
      const carrier = view.parties
        .flatMap((party) => party.heroes)
        .find((hero) => hero.equippedItem?.id === live.cardId)?.card
      const carrierArt = carrier ? artFor(carrier) : null
      challenge.open({
        started: live.started,
        challengedCardUrl: art?.url ?? SMALL_BACK,
        challengedCardAspect: art?.aspect,
        challengeCardUrl: boardChallengeUrl(),
        carrierCardUrl: carrierArt?.url,
        carrierCardAspect: carrierArt?.aspect,
        challengedId: live.defenderId || undefined,
        challengerId: live.challengerId || undefined,
        // Layout only, and never 'p1': an unknown seat must not be read as
        // the viewer's — that is what named both sides "YOU".
        challengedSeat: slotForPlayer(view, live.defenderId) ?? 'p2',
        challengerSeat: slotForPlayer(view, live.challengerId) ?? 'p2',
      })
      if (live.started) {
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
      }
      opened.current = {
        windowId: live.windowId,
        started: live.started,
        shown: { challenged: challengedCount, challenger: challengerCount },
      }
      return
    }

    // the same window, now CHALLENGED: the rolls arrive and the challenge card
    // takes its place behind the play
    if (live.started && !opened.current.started) {
      opened.current.started = true
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
      opened.current.shown = { challenged: challengedCount, challenger: challengerCount }
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
  }, [windowId, started, challengerCount, challengedCount])

  return live
}
