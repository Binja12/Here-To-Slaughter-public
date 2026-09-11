import { CardView, PendingWindowView, PlayerView } from '../contract'

export interface PlayableFlags {
  monsters: boolean[]
  mainDeck: boolean
  leader: boolean
  heroes: boolean[]
  hand: boolean[]
  endTurn: boolean
  redraw: boolean
  /**
   * The oldest open table window — a roll or a challenge — this seat could
   * still act on and has not yet passed: what the Skip button gives up
   * (PassWindow), or null. Every seat gets the button, the active player
   * included. A pass is per seat, so this going null means only that THIS
   * seat is done — the window stays open on the others' screens, and their
   * buttons stay lit, until each of them forfeits too (the server settles it
   * once every seat that could act has passed). A card landing in the window
   * clears the passes and lights every button again.
   */
  passable: string | null
  /** Every open table window this seat could still act on and has not passed — the Skip button gives them all up at once. */
  passableWindows: string[]
}

/**
 * What each action costs in action points — a MIRROR of the engine's `COST`
 * constants (server/src/game/actions/*.ts) and its hand limit, so a card
 * does not glow for a play the server would refuse `NoActionPoints` /
 * `HandFull` (the owner, 2026-09-03: a monster glowed at 1 AP, the attack was
 * refused, and no roll ever opened). Legality still belongs to the server;
 * this only stops the glow from lying.
 */
/**
 * A card that costs NO action point — a reaction. Gold says free and green
 * says paid (the owner, 2026-09-08), so this also picks a playable hand card's
 * colour; the cost mirror below covers everything that is paid for.
 */
export const isFreeAction = (card: CardView): boolean =>
  card.type === 'Modifier' || card.type === 'Challenge'

export const AP_COST = {
  attack: 2,
  draw: 1,
  playCard: 1,
  rollOnHero: 1,
  rollOnLeader: 1,
  redraw: 3,
} as const
export const MAX_HAND_SIZE = 10

/** Passes change per seat; the clock/roll changes when everyone may react again. */
export function reactionRevision(window: PendingWindowView): string {
  const { passedBy, ...detail } = window.detail ?? {}
  return JSON.stringify([window.deadline, detail])
}

/**
 * Presentation gates copied from the read model plus the cost mirror above.
 * Equipment, deck and party rules are NOT duplicated: the server remains the
 * legality authority and refusals come back via ack.
 */
/** Optionality is declared by the window and projected by the server. */
export const isOptionalWindow = (window: PendingWindowView): boolean =>
  window.optional === true

/** The viewer's own open windows are all optional: the table stays live. */
export const onlyOptionalWindows = (view: PlayerView): boolean =>
  view.pendingWindows.length > 0 &&
  view.pendingWindows.every((window) => window.isYours && isOptionalWindow(window))

/** A window a modifier may currently land in. */
export const takesModifier = (view: PlayerView): boolean =>
  view.pendingWindows.some(
    (window) =>
      window.type === 'Modifier' ||
      window.type === 'Attack' ||
      (window.type === 'Challenge' && window.detail?.challenged === true),
  )

/**
 * A play this seat could still contest. Never the defender's own: the window's
 * respondent is whoever played the card (the server refuses
 * CannotChallengeOwnCard), and only before somebody has challenged.
 */
export const takesChallenge = (view: PlayerView): boolean =>
  view.pendingWindows.some(
    (window) =>
      window.type === 'Challenge' &&
      !!window.cardId &&
      window.respondentId !== view.playerId &&
      window.detail?.challenged !== true &&
      window.detail?.challengeable !== false,
  )

/**
 * Which card type the open reaction window is answered with — what the hand
 * narrows to while it is up (the owner, 2026-09-07). A started challenge takes
 * MODIFIERS, so that reading wins when both are somehow open.
 */
export function reactionCardType(view: PlayerView): 'Modifier' | 'Challenge' | null {
  if (view.phase !== 'Turns') return null
  if (takesModifier(view)) return 'Modifier'
  if (takesChallenge(view)) return 'Challenge'
  return null
}

/**
 * Where THIS item may go — a MIRROR of the engine's equip rule (server
 * item-tasks.ts canEquip): a bare hero, in your OWN party for a plain item
 * and in somebody ELSE's for a cursed one (the owner, 2026-09-08).
 *
 * Board.tsx turns these into targeting keys and derivePlayable asks only
 * whether there are any, because an item with nowhere to go must neither glow
 * nor take a press. `cursed` is optional on the client's card view, so an
 * absent flag reads as plain — the same way the server's required boolean
 * defaults.
 */
export const equipTargets = (
  view: PlayerView,
  item: CardView,
): { playerId: string; index: number }[] => {
  const cursed = item.type === 'Item' && item.cursed === true
  return view.parties
    .filter((party) => (cursed ? party.playerId !== view.playerId : party.playerId === view.playerId))
    .flatMap((party) =>
      party.heroes.flatMap((hero, index) =>
        hero.equippedItem ? [] : [{ playerId: party.playerId, index }],
      ),
    )
}

/**
 * Whether this seat holds a card the open reaction window can be answered
 * with. Read by the hand — which force-opens and rises above the dim only
 * when there is something in it to play (the owner, 2026-09-08) — and by Lazy
 * Choice, which gives the window up when there is not. One question, so the
 * fan and the auto-skip can never disagree about whether you can act.
 */
export const holdsAnswer = (view: PlayerView): boolean => {
  const answers = reactionCardType(view)
  return answers !== null && view.hand.some((card) => card.type === answers)
}

export function derivePlayable(view: PlayerView): PlayableFlags {
  const mine = view.parties.find((party) => party.playerId === view.playerId)
  // `busy` while the only open window is an optional question of ours does
  // not freeze the table: pressing any other action forfeits the question
  // (Board dismisses it first, then sends the action).
  const idle = !view.busy || onlyOptionalWindows(view)
  const actionWindow =
    view.phase === 'Turns' &&
    view.currentPlayerId === view.playerId &&
    idle
  // NOT gated on `busy`: the table is busy exactly while a window is open,
  // and an open window is the only time a reaction is legal (seen live —
  // with the gate, a modifier could never be played on anybody's roll).
  const reactionWindow = view.phase === 'Turns'
  const ap = view.seats.find((seat) => seat.playerId === view.playerId)?.actionPoints ?? 0
  const afford = (cost: number) => actionWindow && ap >= cost
  // A challenge takes modifiers only once somebody has actually challenged
  // (both sides rolled); before that the server refuses ChallengeNotStarted.
  // Conversely a challenge card can only be played while nobody has.
  const modifiable = takesModifier(view)
  const challengeable = takesChallenge(view)

  const me = view.playerId
  const mayActOn = (window: PendingWindowView): boolean => window.canPass === true
  const passedByMe = (window: PendingWindowView): boolean => {
    const passed = window.detail?.passedBy
    return Array.isArray(passed) && passed.includes(me)
  }
  const tableWindows =
    view.phase === 'Turns'
      ? view.pendingWindows.filter(
          (window) =>
            mayActOn(window),
        )
      : []
  const passableWindows = tableWindows
    .filter((window) => !passedByMe(window))
    .map((window) => window.windowId)
  const passable = passableWindows[0] ?? null

  return {
    mainDeck: afford(AP_COST.draw) && view.hand.length < MAX_HAND_SIZE && view.mainDeck.count > 0,
    hand: view.hand.map((card) => {
      if (card.type === 'Modifier') return reactionWindow && modifiable
      if (card.type === 'Challenge') return reactionWindow && challengeable
      if (card.type === 'Item')
        return afford(AP_COST.playCard) && equipTargets(view, card).length > 0
      return afford(AP_COST.playCard) && ['Hero', 'Magic'].includes(card.type)
    }),
    heroes: mine?.heroes.map((hero) => afford(AP_COST.rollOnHero) && hero.canRollOn) ?? [],
    leader: !!mine && afford(AP_COST.rollOnLeader) && mine.canRollOnLeader,
    monsters: view.monsterRow.map(
      (monster) =>
        afford(AP_COST.attack) && view.attackableMonsterIds.includes(monster.id),
    ),
    redraw: afford(AP_COST.redraw),
    endTurn: actionWindow,
    passable,
    passableWindows,
  }
}
