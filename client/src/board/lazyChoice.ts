import { useEffect, useRef, useState } from 'react'
import type { PendingWindowView, PlayerView } from '../contract'
import { derivePlayable, holdsAnswer, isOptionalWindow, reactionCardType } from './playable'
import { liveRollOf, rollOutcome } from './liveRoll'
import { openChoice } from './choicePrompt'
import { useGameInfo } from '../state/game'

/**
 * How long a lazy SKIP waits before it lands, as a share of the table's
 * reaction clock. A pass that arrives the instant a window opens tells
 * everyone you are holding nothing (the owner, 2026-09-08) — the whole point
 * of a face-down hand is that they cannot know that. Only skips wait: a value
 * or a "yes" gives away nothing that is not already on the table.
 */
const SKIP_DELAY_SHARE = 0.3
const SKIP_DELAY_MS = 4500

/**
 * LAZY CHOICE — the answers a player almost always gives, given for them.
 *
 * A private screen setting (boardSettings.ts), so nothing here reaches the
 * server as anything but the ordinary commands the player could have pressed
 * by hand. The engine remains the legality authority: a lazy answer it
 * refuses is refused exactly like a manual one.
 *
 * Deliberately NOT an engine feature. The engine already owns what happens
 * when nobody answers — every window's `defaultChoice` on timeout — and a
 * second "answer for me" living beside it would race it with different rules.
 * This one only presses buttons, sooner.
 */

/** What a lazy player would do right now, and the state that asked for it. */
export type LazyMove = {
  /** `skip` gives up every window this seat may still pass, like the button. */
  kind: 'skip' | 'submit'
  windowId: string
  choice?: unknown
  /**
   * Identity of the QUESTION, not of the answer: `windowId` plus the window's
   * deadline. A window that re-arms — passes cleared because a card landed on
   * the roll — gets a new deadline and so a fresh answer, while a snapshot
   * that merely repeats the same standing question does not.
   */
  key: string
}

const keyOf = (window: PendingWindowView) => `${window.windowId}:${window.deadline}`

/**
 * A choice of ACTION whose answer is never in doubt. The Corrupted
 * Sabretooth's "you may STEAL that Hero card instead" is a strictly better
 * destroy — the hero leaves their party either way, and stealing keeps it
 * (the owner, 2026-09-08). Silence takes the printed destroy, so this is one
 * more answer no engine default could give.
 *
 * Matched on the engine's own label (hero-tasks.ts STEAL_INSTEAD), not on
 * wording invented here.
 */
const PREFERRED_ACTION = 'Steal it instead'

/**
 * Whether a confirm is the "you may DRAW" kind. The engine has no flag for
 * it, so this reads the label the ability declared — `ArcticAriesDrawsCard`,
 * `CrownedSerpentDraws`, `PlunderingPumaVictimDraws`. A free card is a free
 * card whoever is drawing it.
 */
const isDrawOffer = (window: PendingWindowView): boolean =>
  /draw/i.test(typeof window.detail?.confirms === 'string' ? window.detail.confirms : '')

/**
 * The number a lazy player takes off a modifier card — and therefore the roll
 * it lands on, because a plus is only worth playing on the side you want to
 * win and a minus only on the side you want to lose.
 *
 * The BIGGEST IMPACT on the gap between the two rolls (the owner, 2026-09-08):
 * the larger of |+| and |-|. Level — a +2/-2 — goes to the plus, on your own
 * roll: the same swing either way, and helping yourself is the half you keep
 * if the other side is later removed.
 *
 * A card printed with ONE value has nothing to choose but still has a side:
 * +4 belongs on the roll you back, -4 on the roll you do not.
 */
export function lazyModifierValue(values: number[]): number | null {
  if (values.length === 0) return null
  if (values.length === 1) return values[0]
  const up = Math.max(...values)
  const down = Math.min(...values)
  if (up <= 0) return down
  if (down >= 0) return up
  return up >= -down ? up : down
}

/**
 * Whose side a lazy player is on in a challenge: their own when they are in
 * it, and the CHALLENGER when they are not — the same way an unanswered
 * challenge tips, toward the play being defeated (server challenge-window.ts
 * valueBiasFor).
 */
export function backedRole(
  view: PlayerView,
  defenderId: string,
  challengerId: string,
): 'challenged' | 'challenger' {
  if (defenderId === view.playerId) return 'challenged'
  if (challengerId === view.playerId) return 'challenger'
  return 'challenger'
}

/**
 * The one move a lazy player makes now, or null.
 *
 * Questions put to this seat come before the table's business, so a value and
 * a draw are answered before a roll is given up: giving up first would settle
 * a window while a question still stands over it.
 */
export function lazyMove(view: PlayerView): LazyMove | null {
  if (view.phase !== 'Turns') return null

  // A VALUE the engine has already declared a direction for. `bias` rides in
  // the window's own payload (server value-choice-window.ts) precisely so a
  // client can act on it: `highest` for a bonus on your own roll, `lowest`
  // for one on somebody else's, and in a challenge whichever way pushes
  // against the card being contested — the challenger high, the defender low.
  // Read, never re-derived: two copies of that rule would drift.
  const value = view.pendingWindows.find(
    (window) =>
      window.isYours && window.type === 'ValueChoice' && !!window.options?.length,
  )
  if (value) {
    const numbers = value.options!.filter(
      (option): option is number => typeof option === 'number',
    )
    if (numbers.length > 0) {
      // In a CHALLENGE the bias is not what the player wants: it says which
      // way an unanswered contest tips (defender low, challenger high), so a
      // defender helping their own roll would be handed the negative. The
      // magnitude decides instead, and it agrees with wherever the card was
      // aimed — a +3/-1 was played to add +3, a +1/-3 to take 3 away.
      const contested = view.pendingWindows.some(
        (window) => window.type === 'Challenge' && window.detail?.challenged === true,
      )
      const swing = contested ? lazyModifierValue(numbers) : null
      const lowest = value.detail?.bias === 'lowest'
      return {
        kind: 'submit',
        windowId: value.windowId,
        choice: swing ?? (lowest ? Math.min(...numbers) : Math.max(...numbers)),
        key: keyOf(value),
      }
    }
  }

  // A choice of action with an obvious answer: take the steal over the
  // destroy. Before the draw, because it is a question about a card already
  // leaving the table.
  const action = view.pendingWindows.find(
    (window) =>
      window.isYours &&
      window.type === 'TaskChoice' &&
      window.options?.includes(PREFERRED_ACTION),
  )
  if (action) {
    return {
      kind: 'submit',
      windowId: action.windowId,
      choice: PREFERRED_ACTION,
      key: keyOf(action),
    }
  }

  // "You may draw a card?" — yes. Note this is the one rule that CANNOT be
  // expressed as an engine default: a confirm's silent answer is DISMISS, so
  // saying yes is the opposite of saying nothing.
  const draw = view.pendingWindows.find(
    (window) => window.isYours && isOptionalWindow(window) && isDrawOffer(window),
  )
  if (draw) {
    return {
      kind: 'submit',
      windowId: draw.windowId,
      choice: 'confirm',
      key: keyOf(draw),
    }
  }

  // Nothing else while a question of this seat's own is standing: it is the
  // thing being waited on, and passing the table's window would settle a roll
  // out from under it.
  if (openChoice(view)) return null

  const [windowId] = derivePlayable(view).passableWindows
  if (!windowId) return null
  const window = view.pendingWindows.find((entry) => entry.windowId === windowId)
  if (!window) return null

  // TWO reasons to give a window up, and both mean the same thing: there is
  // nothing left for this seat to decide about it.

  // Nothing to answer WITH: the window wants a card of one type and this
  // seat holds none. The same question the hand asks before it opens itself.
  const emptyHanded = reactionCardType(view) !== null && !holdsAnswer(view)

  // Nothing to answer FOR. Two settled rolls: MINE that already clears its
  // requirement, and an ENEMY's that has already failed — neither leaves
  // anything worth spending a card on (the owner, 2026-09-08). If somebody
  // then modifies either one it stops being true, and a card landing clears
  // the passes, so the question comes back and is answered afresh.
  const roll = liveRollOf(view)
  const mine = !!roll && roll.rollerId === view.playerId
  const alreadyClear =
    mine && roll!.rollReq !== undefined && roll!.finalRoll >= roll!.rollReq
  const alreadyLost =
    !!roll && !mine && rollOutcome(roll, view) === 'failure'

  return emptyHanded || alreadyClear || alreadyLost
    ? { kind: 'skip', windowId, key: keyOf(window) }
    : null
}

/**
 * Plays the lazy move it is given, and says whether a skip is waiting to
 * land. The move is decided by the CALLER, during render, because the board
 * has to know a window is about to be answered before it draws it — an
 * overlay put up and taken down again in the same beat is a flash (the owner,
 * 2026-09-08, on the Protecting Horn's value over a +1/-3).
 *
 * `skip` goes through the board's own forfeit — the same path the Skip button
 * takes, which passes every window this seat may pass and never declines its
 * own question on the way.
 *
 * The returned flag is what stops the Skip button being pressable while a
 * lazy pass is already on its way: an action the player cannot take back is
 * not an action to offer them.
 */
export function useLazyChoice(
  move: LazyMove | null,
  submit: (windowId: string, choice: unknown) => void,
  skip: () => void,
): boolean {
  const info = useGameInfo()
  const wait = info
    ? Math.round(info.config.reactionTimeMs * SKIP_DELAY_SHARE)
    : SKIP_DELAY_MS
  const key = move?.key ?? null
  // The last question answered, so a standing one is not answered twice while
  // its snapshot is still in flight.
  const answered = useRef<string | null>(null)
  const act = useRef<{ submit: typeof submit; skip: typeof skip }>({ submit, skip })
  act.current = { submit, skip }
  const [passing, setPassing] = useState(false)

  useEffect(() => {
    if (move === null || key === null || answered.current === key) return
    answered.current = key
    if (move.kind !== 'skip') {
      act.current.submit(move.windowId, move.choice)
      return
    }
    setPassing(true)
    const timer = setTimeout(() => {
      setPassing(false)
      act.current.skip()
    }, wait)
    return () => {
      clearTimeout(timer)
      setPassing(false)
    }
    // `key` is the whole of the question's identity; `move` is derived from it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wait])

  return passing
}
