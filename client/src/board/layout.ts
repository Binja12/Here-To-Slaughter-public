/**
 * Board layout — modular frame WIDGETS over a plain felt table.
 *
 * RESPONSIVE MODEL (per the user): widgets do NOT rescale when the window
 * changes width — they keep their size and only REPOSITION. Achieved by:
 *  - sizing every widget in `cqh` (1% of the game container's HEIGHT), so
 *    size depends on height only, never width;
 *  - anchoring each player to their screen edge (bottom/top/left/right) and
 *    positioning that player's widgets by fixed cqh offsets, so a player's
 *    three widgets keep constant distances from each other while the gaps
 *    BETWEEN players flex with the window.
 *
 * The container declares `container-type: size`; on a 16:9 window cqh≈cqw.
 */

import type React from 'react';

const WIDGETS = '/board/Border Widgets/';
export const TABLE_BG = WIDGETS + 'Table Background.png';

export const FRAMES = {
  heroes: WIDGETS + 'Heroes Frame.png', // 2172x724  aspect 3.00
  leader: WIDGETS + 'Leader Card Frame.png', // 1024x1536 aspect 0.667
  cardback: WIDGETS + 'Small Card Back Frame.png', // 1060x1484 aspect 0.714
  big: WIDGETS + 'Big Card Frame.png', // 956x1645  aspect 0.581
  center: WIDGETS + 'Center Border Frame.png', // 1254x1254 aspect 1.0
} as const;

export type FrameKind = keyof typeof FRAMES;

export const ASPECT: Record<FrameKind, number> = {
  heroes: 2172 / 724,
  leader: 1024 / 1536,
  cardback: 1060 / 1484,
  big: 956 / 1645,
  center: 1,
};

/**
 * Fraction of each frame that is the inner card window (centred). Measured
 * by hand from the painted PNGs (scan the dark window's pixel bounds against
 * the full canvas) so the card content never bleeds over the gold trim.
 */
export const INSET: Record<FrameKind, { w: number; h: number }> = {
  heroes: { w: 0.94, h: 0.72 },
  leader: { w: 0.8, h: 0.86 },
  cardback: { w: 0.76, h: 0.82 },
  big: { w: 0.84, h: 0.86 },
  center: { w: 0.82, h: 0.82 },
};

/* ------------------------------------------------------------------ */
/* Sizes (heights in cqh) — bottom player bigger, others share a size. */
/* ------------------------------------------------------------------ */

export const CENTER_H = 42; // centre square height (cqh)

const BIG = { leader: 38, heroes: 26, cardback: 33 };
const SML = { leader: 27, heroes: 20, cardback: 24 };

/* ------------------------------------------------------------------ */
/* Widget placement. dx/dy are the widget CENTRE offset in cqh.         */
/*   bottom/top: dx from horizontal centre (+right); dy from that edge  */
/*   left/right: dy from vertical centre (+down);   dx from that edge   */
/* ------------------------------------------------------------------ */

export type Anchor = 'bottom' | 'top' | 'left' | 'right' | 'center';

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

export const PLAYERS: Record<'p1' | 'p2' | 'p3' | 'p4', PlayerDef> = {
  // BOTTOM (big) — leader | heroes | cardback along the bottom edge
  p1: {
    anchor: 'bottom',
    leader: { kind: 'leader', h: BIG.leader, dx: -54, dy: 21 },
    heroes: { kind: 'heroes', h: BIG.heroes, dx: 0, dy: 15 },
    cardback: { kind: 'cardback', h: BIG.cardback, dx: 53, dy: 18.5 },
  },
  // TOP (small) — mirror arrangement along the top edge
  p2: {
    anchor: 'top',
    leader: { kind: 'leader', h: SML.leader, dx: -40, dy: 16.5 },
    heroes: { kind: 'heroes', h: SML.heroes, dx: 0, dy: 12 },
    cardback: { kind: 'cardback', h: SML.cardback, dx: 39.6, dy: 14 },
  },
  // LEFT (small) — leader+cardback up top, heroes bar below
  p3: {
    anchor: 'left',
    leader: { kind: 'leader', h: SML.leader, dx: 11, dy: -30 },
    cardback: { kind: 'cardback', h: SML.cardback, dx: 29.6, dy: -28.5 },
    heroes: { kind: 'heroes', h: SML.heroes, dx: 32, dy: -5.5 },
  },
  // RIGHT (small) — horizontal mirror of LEFT
  p4: {
    anchor: 'right',
    leader: { kind: 'leader', h: SML.leader, dx: 11, dy: -30 },
    cardback: { kind: 'cardback', h: SML.cardback, dx: 29.6, dy: -28.5 },
    heroes: { kind: 'heroes', h: SML.heroes, dx: 32, dy: -5.5 },
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
    case 'bottom':
      return { left: `calc(50% + ${dx}cqh)`, top: `calc(100% - ${dy}cqh)` };
    case 'top':
      return { left: `calc(50% + ${dx}cqh)`, top: `${dy}cqh` };
    case 'left':
      return { left: `${dx}cqh`, top: `calc(50% + ${dy}cqh)` };
    case 'right':
      // mirror of 'left': centre at dx from the RIGHT edge (keep the same
      // -translate-x-1/2 the widget already has, so use left:calc(100%-dx))
      return { left: `calc(100% - ${dx}cqh)`, top: `calc(50% + ${dy}cqh)` };
    case 'center':
    default:
      return { left: '50%', top: '50%' };
  }
}
