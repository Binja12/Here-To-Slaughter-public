/**
 * Board layout — modular frame WIDGETS over a plain felt table.
 *
 * RESPONSIVE MODEL: every geometry length below is expressed in `cqh`/`cqw`
 * relative to the BOARD STAGE — a centred, locked 16:9 box (the 1920×1080
 * reference space) that declares `container-type: size` in Board.tsx. Because
 * the stage is always 16:9, cqh and cqw hold a constant ratio (1cqh = 0.5625cqw)
 * and the stage scales UNIFORMLY to fit the viewport. So the whole composition
 * — widget sizes AND the gaps between players — scales together and the 16:9
 * layout is preserved identically at every resolution (ultrawide/tall viewports
 * just gain more letterbox felt, never extra spacing between board objects).
 *
 * Each widget is sized in `cqh` and anchored to its stage edge
 * (bottom/top/left/right) by fixed cqh offsets, keeping a player's three
 * widgets at constant relative distances from each other and their edge.
 */

import type React from "react";

const WIDGETS = "/board/Border Widgets/";
export const TABLE_BG = WIDGETS + "Table Background.png";

export const FRAMES = {
  heroes: WIDGETS + "Heroes Frame.png", // 2172x724  aspect 3.00
  leader: WIDGETS + "Leader Card Frame.png", // 1024x1536 aspect 0.667
  cardback: WIDGETS + "Small Card Back Frame.png", // 1060x1484 aspect 0.714
  big: WIDGETS + "Big Card Frame.png", // 956x1645  aspect 0.581
  center: WIDGETS + "Center Border Frame.png", // 1254x1254 aspect 1.0
} as const;

export type FrameKind = keyof typeof FRAMES;

export const ASPECT: Record<FrameKind, number> = {
  heroes: 2172 / 724,
  leader: 1024 / 1536,
  cardback: 1060 / 1484,
  big: 956 / 1645,
  center: 1,
};

/* HUD art (turn banner + action-points bar). Self-contained widgets, not
 * card frames — placed by HUD_WIDGETS below. */
export const HUD = {
  actionFrame: WIDGETS + "Action Pointer Border.png", // 2508x627 aspect 4.0
  actionGem: WIDGETS + "Action Point Gem.png", // 1254x1254 aspect 1.0
  yourTurn: WIDGETS + "Your Turn Show.png", // 2508x627 aspect 4.0
  endTurn: WIDGETS + "End Turn Button.png", // 2172x724 aspect 3.0
  redraw: WIDGETS + "Redraw Button.png", // 2172x724 aspect 3.0
} as const;

export const HUD_ASPECT = {
  actionFrame: 2508 / 627,
  yourTurn: 2508 / 627,
  button: 2172 / 724,
} as const;

/**
 * Fraction of each frame that is the inner card window (centred). Measured
 * by hand from the painted PNGs (scan the dark window's pixel bounds against
 * the full canvas) so the card content never bleeds over the gold trim.
 */
export const INSET: Record<FrameKind, { w: number; h: number }> = {
  heroes: { w: 0.88, h: 0.65 },
  leader: { w: 0.66, h: 0.74 },
  cardback: { w: 0.6, h: 0.7 },
  big: { w: 0.88, h: 0.88 },
  center: { w: 0.82, h: 0.82 },
};

/* ------------------------------------------------------------------ */
/* Sizes (heights in cqh) — bottom player bigger, others share a size. */
/* ------------------------------------------------------------------ */

export const CENTER_H = 64; // centre square height (cqh)
export const CENTER_DX = 0; // centre offset from horizontal centre (+right, cqh)
export const CENTER_DY = -4; // centre offset from vertical centre (+down, cqh)

const BIG = { leader: 45, heroes: 35, cardback: 36 };
const SML = { leader: 33, heroes: 24, cardback: 20 };

/* ------------------------------------------------------------------ */
/* Widget placement. dx/dy are the widget CENTRE offset in cqh.         */
/*   bottom/top: dx from horizontal centre (+right); dy from that edge  */
/*   left/right: dy from vertical centre (+down);   dx from that edge   */
/* ------------------------------------------------------------------ */

export type Anchor = "bottom" | "top" | "left" | "right" | "center";

export interface WidgetDef {
  kind: FrameKind;
  h: number; // height cqh
  dx: number;
  dy: number;
}

export interface PlayerDef {
  anchor: Anchor;
  leader: WidgetDef;
  heroes: WidgetDef;
  cardback: WidgetDef;
}

export type PlayerId = "p1" | "p2" | "p3" | "p4";

export const PLAYERS: Record<PlayerId, PlayerDef> = {
  // BOTTOM (big) — leader | heroes | cardback along the bottom edge
  p1: {
    anchor: "bottom",
    leader: { kind: "leader", h: BIG.leader, dx: -65, dy: 20 },
    heroes: { kind: "heroes", h: BIG.heroes, dx: 0, dy: 14 },
    cardback: { kind: "cardback", h: BIG.cardback, dx: 63, dy: 16 },
  },
  // TOP (small) — mirror arrangement along the top edge
  p2: {
    anchor: "top",
    leader: { kind: "leader", h: SML.leader, dx: -44, dy: 15 },
    heroes: { kind: "heroes", h: SML.heroes, dx: 0, dy: 10 },
    cardback: { kind: "cardback", h: SML.cardback, dx: 41, dy: 10 },
  },
  // LEFT (small) — leader+cardback up top, heroes bar below
  p3: {
    anchor: "left",
    leader: { kind: "leader", h: SML.leader, dx: 20, dy: -24 },
    cardback: { kind: "cardback", h: SML.cardback, dx: 0, dy: -19 },
    heroes: { kind: "heroes", h: SML.heroes, dx: 23, dy: 0 },
  },
  // RIGHT (small) — horizontal mirror of LEFT
  p4: {
    anchor: "right",
    leader: { kind: "leader", h: SML.leader, dx: 20, dy: -24 },
    cardback: { kind: "cardback", h: SML.cardback, dx: 0, dy: -19 },
    heroes: { kind: "heroes", h: SML.heroes, dx: 23, dy: 0 },
  },
};

/** width (cqh) of a widget from its height + aspect */
export const widthCqh = (d: WidgetDef) => d.h * ASPECT[d.kind];

/** CSS left/top for a widget centre, given the player's anchor + dx/dy. */
export function positionStyle(
  anchor: Anchor,
  dx: number,
  dy: number,
): React.CSSProperties {
  switch (anchor) {
    case "bottom":
      return { left: `calc(50% + ${dx}cqh)`, top: `calc(100% - ${dy}cqh)` };
    case "top":
      return { left: `calc(50% + ${dx}cqh)`, top: `${dy}cqh` };
    case "left":
      return { left: `${dx}cqh`, top: `calc(50% + ${dy}cqh)` };
    case "right":
      // mirror of 'left': centre at dx from the RIGHT edge (keep the same
      // -translate-x-1/2 the widget already has, so use left:calc(100%-dx))
      return { left: `calc(100% - ${dx}cqh)`, top: `calc(50% + ${dy}cqh)` };
    case "center":
    default:
      // centre-anchored widgets (the monster/deck frames inside the centre
      // board): dx/dy are the widget-centre offset in cqh from the centre of
      // their parent (+right / +down).
      return { left: `calc(50% + ${dx}cqh)`, top: `calc(50% + ${dy}cqh)` };
  }
}

/* ------------------------------------------------------------------ */
/* Centre-board contents — the flipped monsters + the deck piles, each   */
/* a frame WIDGET placed INSIDE the centre wooden board. dx/dy are the    */
/* widget-centre offset (cqh) from the centre board's CENTRE (+right /    */
/* +down); h scales it; INSET[kind] sets its inner card window. Same      */
/* knobs as the player widgets. Rough placement — tune freely.           */
/* ------------------------------------------------------------------ */

export interface CenterSlots {
  monsters: [WidgetDef, WidgetDef, WidgetDef]; // 3 big frames (flipped monsters)
}

export const CENTER_SLOTS: CenterSlots = {
  monsters: [
    { kind: "big", h: 29, dx: -16, dy: -8 },
    { kind: "big", h: 29, dx: 0, dy: -8 },
    { kind: "big", h: 29, dx: 16, dy: -8 },
  ],
};

/**
 * Deck piles (main deck, discard, monster deck) — same dx/dy/h placement
 * mechanic as the frame widgets above (positioned via `positionStyle`,
 * "center" anchor, relative to the centre board's centre), but with NO frame,
 * so each carries its own `aspect` (art aspect ratio) instead of looking one
 * up from FrameKind. Rough placement — tune freely.
 */
export interface DeckDef {
  h: number; // height cqh
  dx: number;
  dy: number;
  aspect: number; // width/height of the card art (no frame to derive it from)
}

export const DECK_SLOTS: {
  mainDeck: DeckDef;
  discard: DeckDef;
  monsterDeck: DeckDef;
} = {
  mainDeck: { h: 15, dx: -16, dy: 15, aspect: 1060 / 1484 },
  discard: { h: 15, dx: 0, dy: 15, aspect: 1060 / 1484 },
  monsterDeck: { h: 17, dx: 16, dy: 14, aspect: 956 / 1645 },
};

/** width (cqh) of a deck slot from its height + art aspect */
export const deckWidthCqh = (d: DeckDef) => d.h * d.aspect;

/**
 * Dice throws — every seat throws TWO dice onto its own patch of open felt
 * beside the centre board, arriving FROM the thrower's side of the table.
 * Rendered by DiceRoll.tsx; all values are cqh, hand-tunable like every
 * other widget:
 *  - dx/dy    — the landing spot's centre, offset from the STAGE centre
 *               (+right/+down).
 *  - fromDx/fromDy — where the dice COME FROM, relative to the landing spot
 *               (the throw direction is from → spot); points back toward the
 *               thrower's seat.
 *  - pairDx/pairDy — half the separation between the two dice: die A lands at
 *               spot −(pair), die B at spot +(pair). Horizontal pairs in the
 *               wide bottom spaces, near-vertical pairs in the narrow side
 *               columns beside the board.
 */
export const DICE_SIZE = 7.95; // each die (h × h cqh) — the original 11 shrunk 15% twice

export interface DiceSpotDef {
  dx: number;
  dy: number;
  fromDx: number;
  fromDy: number;
  pairDx: number;
  pairDy: number;
}

export const DICE_SPOTS: Record<PlayerId, DiceSpotDef> = {
  // bottom seat → bottom-LEFT space, thrown up-left from the bottom edge
  p1: { dx: -39, dy: 16.5, fromDx: 16, fromDy: 14, pairDx: 5.4, pairDy: -0.8 },
  // top seat → top-RIGHT column, thrown down-right from the top edge
  p2: { dx: 37.5, dy: -22, fromDx: -14, fromDy: -12, pairDx: 1.5, pairDy: 5 },
  // left seat → top-LEFT column, thrown up-right from the left table
  p3: { dx: -38.5, dy: -22, fromDx: -14, fromDy: 10, pairDx: -1.5, pairDy: 5 },
  // right seat → bottom-RIGHT space, thrown down-left from the right table
  p4: { dx: 39, dy: 16.5, fromDx: 16, fromDy: -10, pairDx: 5.4, pairDy: 0.8 },
};

/* ------------------------------------------------------------------ */
/* Challenge window (ChallengeWindow.tsx) — geometry of the paused-game  */
/* overlay: the challenged card centre-stage with the challenge card     */
/* tucked behind it at an angle, plus one roll panel per side            */
/* (challenged LEFT/green, challenger RIGHT/red). All cqh relative to    */
/* the stage, hand-tunable like every other widget.                      */
/* ------------------------------------------------------------------ */

export const CHALLENGE_LAYOUT = {
  /** the challenged card (the play being contested) — centre offset from
   *  the STAGE centre (+right/+down), height in cqh */
  card: { h: 42, dx: 0, dy: -6 },
  /** the challenge card tucked BEHIND it (like an item behind its hero):
   *  `peek` = fraction of its width showing past the right edge,
   *  `angle` = its tilt in degrees, `scale` = its height relative to the
   *  challenged card's. */
  tuck: { peek: 0.3, angle: 14, scale: 0.94 },
  /** the two roll panels — centres at ±dx from the stage centre
   *  (challenged at −dx, challenger at +dx), w/h in cqh */
  panel: { w: 30, h: 26, dx: 43, dy: -6 },
  /** the roll-total scroll (the board's "your turn" art) inside a panel —
   *  centre offset in cqh from the PANEL centre */
  scroll: { h: 6, dx: 0, dy: 10.5 },
  /** modifier cards played onto a roll, by the panel's outer edge — dx is
   *  mirrored toward that side's OUTER edge (challenged left, challenger
   *  right); each next card steps `step` further out and tilts `angle`°
   *  (also mirrored) */
  modCard: { h: 13, dx: 20, dy: 6.5, step: 2.2, angle: 9 },
  /** the dice throw inside a panel: dx/dy = the pair's landing centre from
   *  the PANEL centre; fromDx/fromDy/pairDx/pairDy have the exact same
   *  semantics as DICE_SPOTS. Each side's throw arrives from its own outer
   *  edge of the screen. */
  dice: {
    size: 6.5,
    spots: {
      challenged: { dx: 0, dy: 4, fromDx: -20, fromDy: -14, pairDx: 4.3, pairDy: 0 },
      challenger: { dx: 0, dy: 4, fromDx: 20, fromDy: -14, pairDx: 4.3, pairDy: 0 },
    },
  },
} as const;

/**
 * `transform-origin` (as "x% y%") for a card's hover zoom, chosen so the card
 * grows TOWARD the board centre and never off-screen. The origin is pinned to
 * the card's OUTER side (the side nearest the screen edge) so scaling expands
 * inward. Widgets within a dead-zone of an axis's centre stay centred (50%) on
 * that axis. Same dx/dy semantics as `positionStyle`.
 */
const ORIGIN_DEADZONE = 5; // cqh; within this of centre → 50% on that axis
export function zoomOrigin(anchor: Anchor, dx: number, dy: number): string {
  const bias = (v: number) =>
    v < -ORIGIN_DEADZONE ? 0 : v > ORIGIN_DEADZONE ? 100 : 50;
  let ox = 50;
  let oy = 50;
  switch (anchor) {
    case "bottom":
      ox = bias(dx);
      oy = 100; // grow up
      break;
    case "top":
      ox = bias(dx);
      oy = 0; // grow down
      break;
    case "left":
      ox = 0; // grow right (inward)
      oy = bias(dy);
      break;
    case "right":
      ox = 100; // grow left (inward)
      oy = bias(dy);
      break;
    case "center":
    default:
      ox = bias(dx);
      oy = bias(dy);
      break;
  }
  return `${ox}% ${oy}%`;
}

/* ------------------------------------------------------------------ */
/* HUD widgets — turn banner + action-points bar. Placed in stage cqh    */
/* like the players (anchor + dx/dy); `h` is height in cqh, width comes   */
/* from HUD_ASPECT. Rough placement (top-right) — tune freely.           */
/* ------------------------------------------------------------------ */

export interface HudDef {
  anchor: Anchor;
  h: number; // height cqh
  dx: number;
  dy: number;
}

export const HUD_WIDGETS: {
  actionPoints: HudDef;
  endTurn: HudDef;
  redraw: HudDef;
  /** the top-left dev row: re-open the challenge window, restart the test */
  challengeButton: HudDef;
  restartButton: HudDef;
} = {
  // The owner's placement (2026-09-03): the action-point gems and, right
  // under them, the End Turn button, together in the top-right strip above
  // the right seat's leader (his red rectangle: ~28cqh wide, ~11cqh tall,
  // top edge near the stage top). No turn scroll any more. Redraw under
  // the main deck (`center` = offset from the STAGE centre; the deck sits
  // at centre-board dy 15, board dy -4).
  actionPoints: { anchor: "top", h: 5, dx: 62, dy: 4.5 },
  endTurn: { anchor: "top", h: 5, dx: 62, dy: 10 },
  redraw: { anchor: "center", h: 4.5, dx: -16, dy: 22 },
  challengeButton: { anchor: "top", h: 4, dx: -80, dy: 4 },
  restartButton: { anchor: "top", h: 4, dx: -66, dy: 4 },
};

/**
 * Modifier cards played onto the CURRENT BOARD ROLL (no challenge window —
 * they apply straight to the roll) — fanned beside the turn banner (the
 * board's "roll scroll", HUD_WIDGETS.yourTurn). Same anchor+dx/dy semantics
 * as the HUD widgets; each next card steps `step` further left and tilts
 * `angle`°. Cleared with the roll (new throw / turn end).
 */
export const ROLL_MOD_CARDS = {
  anchor: "top" as Anchor,
  h: 11,
  dx: 46,
  dy: 9,
  step: 2,
  angle: -8,
};
