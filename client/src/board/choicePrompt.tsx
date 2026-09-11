import React, { useEffect, useRef, useState } from 'react'
import type { ChoiceLapseView, PendingWindowView, PlayerView } from '../contract'
import { reactionCardType } from './playable'
import { nameOf } from './seats'
import { cardById } from './viewTargets'
import { useGameInfo } from '../state/game'

/**
 * The one line that tells the player what a choice wants of them — "Choose a
 * hero to sacrifice", "Choose a player to pull a card from" — put up in large
 * type over whatever the choice is being answered on (the owner, 2026-09-07).
 *
 * The wording comes from the ENGINE: every choice-opening task declares a
 * `question` (server/src/game/tasks/choose-tasks.ts), which rides in the
 * window's `detail`. Only the task knows what the pick is FOR — the client
 * sees a list of ids — so the fallbacks below are a last resort for a window
 * whose task has not been given one, never the normal path.
 */

const FALLBACK: Record<string, string> = {
  CardChoice: 'Choose a card',
  PlayerChoice: 'Choose a player',
  MonsterChoice: 'Choose a monster',
  ValueChoice: 'Choose a value',
}

/** what each kind of choice picks, as a word — "A RANDOM CARD…" */
const SUBJECT: Record<string, string> = {
  CardChoice: 'card',
  PlayerChoice: 'player',
  MonsterChoice: 'monster',
  ValueChoice: 'value',
}

/**
 * What became of a choice nobody answered. The engine draws a CardChoice at
 * random rather than let a price be dodged by waiting, and simply drops a
 * MonsterChoice or a PlayerChoice — an attack is an offer, and silence has
 * not taken it. Either way the seat has to be told: the window is gone from
 * the next snapshot and nothing else says why (the owner, 2026-09-08).
 */
export function lapseWords(lapse: ChoiceLapseView): string {
  if (lapse.resolution === 'random') {
    return `a random ${SUBJECT[lapse.type] ?? 'option'} has been chosen`
  }
  return `${lapse.question ?? `choose a ${SUBJECT[lapse.type] ?? 'target'}`} — forfeited`
}

const humanize = (label: string) =>
  label.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())

/** What this window is asking, in words. */
export function choiceInstruction(window: PendingWindowView): string {
  const detail = window.detail ?? {}
  if (typeof detail.question === 'string' && detail.question) return detail.question
  // a confirm's engine label is the last resort — "PlayAnItem" → "Play an item?"
  if (typeof detail.confirms === 'string') return `${humanize(detail.confirms).toLowerCase().replace(/^./, (c) => c.toUpperCase())}?`
  return FALLBACK[window.type] ?? 'Choose'
}

/** A roll or a challenge is the table's business, not a question put to a seat. */
const TABLE = new Set(['Modifier', 'Attack', 'Challenge'])

/** The choice this seat is being asked right now, if any. */
export function openChoice(view: PlayerView): PendingWindowView | undefined {
  return view.pendingWindows.find(
    (window) => window.isYours && !TABLE.has(window.type),
  )
}

/**
 * How long a LAPSE notice stays up — a quarter of the table's own reaction
 * clock (the owner, 2026-09-08), so a slow table reads slowly. The constant is
 * only the fallback for a screen with no config yet.
 *
 * The QUESTION itself has no linger: it is on screen exactly while it stands.
 */
const LINGER_MS = 1500
const LINGER_SHARE = 0.25

/**
 * Never takes a click: the answer is a press on a card, a button or a board
 * target UNDER this, and a banner that swallowed presses would break every one
 * of them (the owner, 2026-09-07: "make sure the text doesn't hinder the
 * clicking"). It sits above the reaction overlays and below the settings
 * panel's portal.
 *
 * Sized and placed where the owner drew it (2026-09-08): a plate about
 * 28cqw x 22cqh, centred, big enough to read across the table and clear of
 * the heroes a choice is answered on.
 *
 * TWO lifetimes, not one. The question is up exactly while it stands — press
 * an answer and the words go with it, in the same frame (the owner,
 * 2026-09-08). Only a LAPSE has a duration of its own: nothing else on screen
 * says a pick was made for you, so that one has to linger to be read.
 */
export default function ChoicePrompt({ view }: { view: PlayerView }) {
  const window = openChoice(view)
  const asking = window ? choiceInstruction(window) : null
  const lapse = view.lastLapse
  const lapseId = lapse?.windowId ?? null
  const info = useGameInfo()
  const linger = info ? Math.round(info.config.reactionTimeMs * LINGER_SHARE) : LINGER_MS
  const [notice, setNotice] = useState<string | null>(null)
  // whatever lapse the table was already carrying when this screen opened is
  // history, not news — only a NEW one is announced
  const announced = useRef<string | null>(lapseId)

  useEffect(() => {
    if (lapseId === null || announced.current === lapseId) return
    announced.current = lapseId
    setNotice(lapse ? lapseWords(lapse) : null)
  }, [lapseId, lapse])

  // A notice is read on its own clock; a question standing over it does not
  // stop that clock, it only covers it until it has run out.
  useEffect(() => {
    if (notice === null) return
    const timer = setTimeout(() => setNotice(null), linger)
    return () => clearTimeout(timer)
  }, [notice, linger])

  // the live question wins: it is the thing that still wants an answer
  const shown = asking ?? notice
  if (shown === null) return null
  return (
    <div className="choice-banner dim-exempt pointer-events-none absolute inset-0 z-[220] flex items-center justify-center">
      <div className="flex h-[21.6cqh] w-[28.4cqw] items-center justify-center rounded-[1.2cqw] border-[0.15cqw] border-amber-400/60 bg-black/70 px-[1.4cqw] text-center font-heading text-[2.4cqw] uppercase leading-tight tracking-[0.1cqw] text-amber-200 shadow-[0_0.4cqw_1.4cqw_rgba(0,0,0,0.85)] drop-shadow-[0_0.12cqw_0.25cqw_rgba(0,0,0,0.95)]">
        {shown}
      </div>
    </div>
  )
}

/**
 * What an open reaction window is asking of THIS seat, across the top of the
 * screen (the owner, 2026-09-08). The choice banner sits lower and says what a
 * question wants; this one says only that the table is waiting on a reaction,
 * so the two never occupy the same line.
 *
 * `reactionCardType` is the same test the hand uses to narrow itself to the
 * cards that can answer, so the words and the fan can never disagree — and it
 * already excludes a challenge on this seat's OWN play.
 */
export function ReactionPrompt({ view }: { view: PlayerView }) {
  // A question put to THIS seat comes first, and while it stands nothing else
  // asks anything (the owner, 2026-09-08): its own banner is up and its answers
  // are lit on the board.
  if (openChoice(view)) return null
  const answers = reactionCardType(view)
  // WHAT is being contested, above the question about it (the owner,
  // 2026-09-08). A Challenge window's respondent is whoever made the play —
  // the server refuses a challenge on your own card — so the seat and the
  // card are both already here.
  const contested = view.pendingWindows.find(
    (window) => window.type === 'Challenge' && !!window.cardId,
  )
  const played = contested
    ? `${nameOf(view, contested.respondentId)} played ${
        cardById(view, contested.cardId)?.name ?? 'a card'
      }`
    : null
  if (!answers) return null
  return (
    <div className="reaction-banner dim-exempt pointer-events-none absolute inset-x-0 top-[1.6cqh] z-[220] flex flex-col items-center gap-[0.7cqh]">
      {played && (
        <div className="rounded-full border border-amber-300/40 bg-black/80 px-[1.6cqw] py-[0.6cqh] text-center font-heading text-[1.5cqw] uppercase leading-none tracking-[0.12cqw] text-amber-100 shadow-[0_0.3cqw_1cqw_rgba(0,0,0,0.85)] drop-shadow-[0_0.1cqw_0.2cqw_rgba(0,0,0,0.9)]">
          {played}
        </div>
      )}
      <div className="rounded-full border border-amber-400/50 bg-black/75 px-[1.8cqw] py-[0.8cqh] text-center font-heading text-[1.8cqw] uppercase leading-none tracking-[0.14cqw] text-amber-200 shadow-[0_0.3cqw_1cqw_rgba(0,0,0,0.85)] drop-shadow-[0_0.1cqw_0.2cqw_rgba(0,0,0,0.9)]">
        {answers === 'Challenge' ? 'Do you want to challenge?' : 'Do you want to modify?'}
      </div>
    </div>
  )
}
