import { PendingWindowView, PlayerView } from '../contract'

export interface PlayableFlags {
  monsters: boolean[]
  mainDeck: boolean
  leader: boolean
  heroes: boolean[]
  hand: boolean[]
  endTurn: boolean
  redraw: boolean
}

/**
 * What each action costs in action points — a MIRROR of the engine's `COST`
 * constants (server/src/game/actions/*.ts) and its hand limit, so a card
 * does not glow for a play the server would refuse `NoActionPoints` /
 * `HandFull` (the owner, 2026-09-03: a monster glowed at 1 AP, the attack was
 * refused, and no roll ever opened). Legality still belongs to the server;
 * this only stops the glow from lying.
 */
export const AP_COST = {
  attack: 2,
  draw: 1,
  playCard: 1,
  rollOnHero: 1,
  rollOnLeader: 1,
  redraw: 3,
} as const
export const MAX_HAND_SIZE = 10

/**
 * Presentation gates copied from the read model plus the cost mirror above.
 * Equipment, deck and party rules are NOT duplicated: the server remains the
 * legality authority and refusals come back via ack.
 */
/**
 * A window the viewer may simply walk away from: a yes/no whose "no" is
 * `dismiss` ("roll on the hero you just played?"). The wire has no
 * explicit flag for this yet (an `optional: boolean` on PendingWindowView
 * would be the honest HTSR-4 change); until then, "has a dismiss option"
 * is the tell.
 */
export const isOptionalWindow = (window: PendingWindowView): boolean =>
  window.type === 'TaskChoice' &&
  Array.isArray(window.options) &&
  window.options.includes('dismiss')

/** The viewer's own open windows are all optional: the table stays live. */
export const onlyOptionalWindows = (view: PlayerView): boolean =>
  view.pendingWindows.length > 0 &&
  view.pendingWindows.every((window) => window.isYours && isOptionalWindow(window))

export function derivePlayable(view: PlayerView): PlayableFlags {
  const mine = view.parties.find((party) => party.playerId === view.playerId)
  const reactionOpen = view.pendingWindows.some(
    (window) =>
      window.type === 'Modifier' ||
      window.type === 'Attack' ||
      window.type === 'Challenge',
  )
  // `busy` while the only open window is an optional question of ours does
  // not freeze the table: pressing any other action forfeits the question
  // (Board dismisses it first, then sends the action).
  const idle = !view.busy || onlyOptionalWindows(view)
  const actionWindow =
    view.phase === 'Turns' &&
    view.currentPlayerId === view.playerId &&
    idle &&
    !reactionOpen
  // NOT gated on `busy`: the table is busy exactly while a window is open,
  // and an open window is the only time a reaction is legal (seen live —
  // with the gate, a modifier could never be played on anybody's roll).
  const reactionWindow = view.phase === 'Turns'
  const ap = view.seats.find((seat) => seat.playerId === view.playerId)?.actionPoints ?? 0
  const afford = (cost: number) => actionWindow && ap >= cost
  // A challenge takes modifiers only once somebody has actually challenged
  // (both sides rolled); before that the server refuses ChallengeNotStarted.
  // Conversely a challenge card can only be played while nobody has.
  const modifiable = view.pendingWindows.some(
    (window) =>
      window.type === 'Modifier' ||
      window.type === 'Attack' ||
      (window.type === 'Challenge' && window.detail?.challenged === true),
  )
  const challengeable = view.pendingWindows.some(
    (window) =>
      window.type === 'Challenge' &&
      !!window.cardId &&
      window.detail?.challenged !== true,
  )

  return {
    mainDeck: afford(AP_COST.draw) && view.hand.length < MAX_HAND_SIZE && view.mainDeck.count > 0,
    hand: view.hand.map((card) => {
      if (card.type === 'Modifier') return reactionWindow && modifiable
      if (card.type === 'Challenge') return reactionWindow && challengeable
      return afford(AP_COST.playCard) && ['Hero', 'Item', 'Magic'].includes(card.type)
    }),
    heroes: mine?.heroes.map((hero) => afford(AP_COST.rollOnHero) && hero.canRollOn) ?? [],
    leader: !!mine && afford(AP_COST.rollOnLeader) && mine.canRollOnLeader,
    monsters: view.monsterRow.map(
      (monster) =>
        afford(AP_COST.attack) && view.attackableMonsterIds.includes(monster.id),
    ),
    redraw: afford(AP_COST.redraw),
    endTurn: actionWindow,
  }
}
