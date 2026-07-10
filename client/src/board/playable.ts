/**
 * Which cards the LOCAL player can act on right now — every entry marked true
 * gets the bright-green Hearthstone "playable" aura (`card-aura` in
 * index.css).
 *
 * This is pure UI state: the flags are computed OUTSIDE the board (eventually
 * from the live server snapshot in useGameState — e.g. hero already attacked
 * this turn → false, modifier/challenge in hand during a roll window → true)
 * and simply re-passed on every server update. The board never decides
 * playability itself, it only renders the flags.
 *
 * All arrays are index-aligned with the rendered lists (same order the
 * server sends them).
 */
export interface PlayableFlags {
  /** the 3 flipped arena monsters (attackable), left → right */
  monsters: boolean[];
  /** main deck — the "draw a card" action is available */
  mainDeck: boolean;
  /** the local player's party leader has a usable ability */
  leader: boolean;
  /** the local player's heroes on the board (attack / activated abilities
   *  like "steal a card"), index-aligned with the hero row */
  heroes: boolean[];
  /** the local player's hand cards, index-aligned with the hand fan
   *  (modifiers/challenges can be true even off-turn — during roll windows) */
  hand: boolean[];
}

/** everything off — e.g. opponent's turn with no reaction window open */
export const NOTHING_PLAYABLE: PlayableFlags = {
  monsters: [false, false, false],
  mainDeck: false,
  leader: false,
  heroes: [],
  hand: [],
};

/**
 * The server's OPEN REACTION WINDOWS: which board cards' actions can be
 * challenged / modified RIGHT NOW. Same contract as PlayableFlags — computed
 * outside the board (eventually straight off game:state, the engine's
 * reaction manager keeps exactly this) and re-passed on every update; the
 * board only renders it. Keys use the tkey vocabulary (targeting.tsx), so
 * pressing a challenge/modifier card in hand is ONE targeting request over
 * the matching list — the listed cards glow green, everything else dims.
 */
export interface ReactionWindows {
  /** cards whose action can be challenged (a challenge card's targets) */
  challengeable: string[];
  /** cards whose roll can be modified (a modifier card's targets) */
  modifiable: string[];
}

/** no window open — challenge/modifier cards have nothing to aim at */
export const NO_WINDOWS: ReactionWindows = {
  challengeable: [],
  modifiable: [],
};
