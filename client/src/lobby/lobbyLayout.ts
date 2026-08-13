import type { CSSProperties } from "react";

/* ---------------------------------------------------------------------------
 * Lobby geometry — straight-on layered art, SAME LAYER MODEL AS THE BOARD:
 *
 *   1. BACKGROUND — full-viewport decorative table (Background Empty.png,
 *      `cover`). Owns no layout; odd aspect ratios just crop its border.
 *   2. STAGE — centred, LOCKED 16:9 box (container-type: size) that scales
 *      uniformly to fit the viewport, exactly like the board stage.
 *   3. ART OVERLAYS — the Side Bars and Center Frame PNGs painted FULL-STAGE
 *      (object-fill): all three layer PNGs share one 1672×941 canvas, so
 *      stretching each over the stage keeps them pixel-aligned with each
 *      other by construction.
 *   4. WIDGETS — the FLAT art pieces (Player Frame, Settings, Start Game,
 *      +/- medallions), each ANCHORED on its painted slot below, exactly
 *      like the board's frame widgets: a `Box` is the widget's CENTRE {x,y}
 *      and width `w`; height always follows the art's opaque bbox aspect
 *      (lobbyAssets), so nothing distorts.
 *
 * THE 1672×941 ART CANVAS IS THE REFERENCE FRAME: `Rect`s (painted slots)
 * and `Box`es (widget anchors) are in canvas pixels — measured once off the
 * PNGs (alpha bounds / colour scans), so numbers can be read straight off
 * the art in any editor. boxStyle()/rectStyle()/px() convert to stage units.
 * ------------------------------------------------------------------------- */

export type Seat = 0 | 1 | 2 | 3;

const REF_W = 1672;
const REF_H = 941;

/** A region of the 1672×941 art canvas (top-left based, canvas px). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A widget anchor: CENTRE {x,y} + width in canvas px (height from art). */
export interface Box {
  x: number;
  y: number;
  w: number;
}

/** A rect INSIDE a widget, as fractions of the widget's box (0..1). */
export interface Frac {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ===== painted slots (the layer PNGs' panels — anchors, not widgets) ===== */

/* The side bars' SMALL top/bottom panels — the four player spots (inner
 * dark-wood regions inside the gold trim). Fill order TL, TR, BL, BR. */
export const SEAT_PANELS: Rect[] = [
  { x: 106, y: 65, w: 277, h: 201 }, // 0 — left bar, top
  { x: 1290, y: 65, w: 274, h: 201 }, // 1 — right bar, top
  { x: 106, y: 639, w: 277, h: 198 }, // 2 — left bar, bottom
  { x: 1287, y: 639, w: 279, h: 198 }, // 3 — right bar, bottom
];

/* The bars' big MIDDLE panels — intentionally empty for now (future player
 * details / leader art). */
export const MIDDLE_PANELS: Rect[] = [
  { x: 106, y: 300, w: 285, h: 302 }, // left bar
  { x: 1256, y: 300, w: 285, h: 302 }, // right bar
];

/** The centre frame's inner (transparent) window. */
export const WINDOW_RECT: Rect = { x: 382, y: 65, w: 906, h: 600 };

/** The oval plaque painted under the centre frame (inner oval). */
export const START_RECT: Rect = { x: 666, y: 739, w: 335, h: 153 };

/* ===== widgets: the FLAT art pieces anchored on the slots ===== */

/* One Player Frame per seat, centred on its bar panel. */
export const SEAT_WIDGETS: Box[] = [
  { x: 244, y: 165, w: 290 }, // 0 — left bar, top
  { x: 1427, y: 165, w: 290 }, // 1 — right bar, top
  { x: 244, y: 738, w: 290 }, // 2 — left bar, bottom
  { x: 1426, y: 738, w: 290 }, // 3 — right bar, bottom
];

/* ----- Player Frame interior (fractions of the frame's opaque bbox) -------
 * Measured off the flat art's pixels: parchment name plate top-centre, blue
 * status strip (with brass stud) top-right, avatar ring top-left (banner
 * hangs beneath it), big dark wood panel right/bottom. */
export const FRAME = {
  plate: { x: 0.36, y: 0.115, w: 0.34, h: 0.15 } as Frac,
  strip: { x: 0.715, y: 0.12, w: 0.193, h: 0.105 } as Frac,
  avatar: { cx: 0.171, cy: 0.248, d: 0.206 }, // d = diameter, fraction of frame width
  panel: { x: 0.308, y: 0.296, w: 0.627, h: 0.593 } as Frac,
};

/* ----- +/- medallion: anchored at the TOP of the player widget ------------
 * ONE shared spot straddling the frame's top edge: an empty seat shows the
 * plus (claim the seat), an occupied seat shows the minus (leave the seat) —
 * they swap in place. cx/cy are fractions of the frame box (cy 0 = the top
 * edge), d = diameter as a fraction of the frame WIDTH. */
export const SEAT_BTN = { cx: 0.5, cy: 0, d: 0.2 };

/* ----- Settings board: anchored at the CENTRE of the Center Frame window --
 * The flat art paints its own "Lobby Settings" title + a 2-column × 10-row
 * ledger; SETTINGS_GRID is that ledger's inner region (fractions of the
 * settings bbox) — labels centre-left in the left column, value buttons in
 * the right. */
export const SETTINGS_WIDGET: Box = {
  x: WINDOW_RECT.x + WINDOW_RECT.w / 2, // 835
  y: WINDOW_RECT.y + WINDOW_RECT.h / 2, // 365
  w: 450,
};
export const SETTINGS_GRID = {
  x: 0.116,
  y: 0.234,
  w: 0.763,
  h: 0.662,
  split: 0.496, // column divider, fraction of the grid width
  rows: 10,
};

/* ----- Start Game button: anchored on the oval plaque slot ---------------- */
export const START_WIDGET: Box = {
  x: START_RECT.x + START_RECT.w / 2, // 834
  y: START_RECT.y + START_RECT.h / 2, // 816
  w: 440,
};

/**
 * Canvas-pixel → stage length. 1672 canvas px = 100cqw of the stage, so text
 * and shadows written in canvas pixels scale with the stage like everything
 * else. Usage: fontSize: px(14).
 */
export const px = (n: number) => `${(n / REF_W) * 100}cqw`;

/** position-style for a widget Box (absolute, centred, stage-relative). */
export function boxStyle(b: Box): CSSProperties {
  return {
    position: "absolute",
    left: `${(b.x / REF_W) * 100}%`,
    top: `${(b.y / REF_H) * 100}%`,
    width: `${(b.w / REF_W) * 100}%`,
    transform: "translate(-50%, -50%)",
  };
}

/** position-style for a Rect (absolute, top-left based, stage-relative). */
export function rectStyle(r: Rect): CSSProperties {
  return {
    position: "absolute",
    left: `${(r.x / REF_W) * 100}%`,
    top: `${(r.y / REF_H) * 100}%`,
    width: `${(r.w / REF_W) * 100}%`,
    height: `${(r.h / REF_H) * 100}%`,
  };
}

/** position-style for a Frac inside a widget (absolute, top-left based). */
export function fracStyle(f: Frac): CSSProperties {
  return {
    position: "absolute",
    left: `${f.x * 100}%`,
    top: `${f.y * 100}%`,
    width: `${f.w * 100}%`,
    height: `${f.h * 100}%`,
  };
}
