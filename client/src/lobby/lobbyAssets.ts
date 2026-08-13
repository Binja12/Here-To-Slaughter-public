import { CSSProperties } from 'react';

/* ---------------------------------------------------------------------------
 * Lobby art manifest — client/public/lobby/*.png
 *
 * Every PNG is exported on a padded transparent canvas (e.g. the player frame
 * sits centred on a full 1672×941 canvas), so each entry records BOTH the
 * canvas size (cw×ch) and the opaque bounding box (bx,by,bw,bh — measured
 * once from the alpha channel, threshold α>16). `artStyle()` turns that into
 * a background-crop so a widget box shows EXACTLY the opaque art, edge to
 * edge — placement math can then ignore the padding entirely.
 *
 * The *Tilted* variants have the table's perspective baked in. Left/Right in
 * the filename is the TILT direction, NOT the screen side: art tilted LEFT
 * sits on the RIGHT half of the table, art tilted RIGHT on the LEFT half.
 * The flat variants are kept in the manifest for a future straight-on view
 * (deck builder, results screen…).
 * ------------------------------------------------------------------------- */

export interface LobbyArt {
  url: string;
  cw: number; // canvas size
  ch: number;
  bx: number; // opaque bbox inside the canvas
  by: number;
  bw: number;
  bh: number;
}

const art = (
  file: string,
  cw: number,
  ch: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): LobbyArt => ({ url: `/lobby/${file}`, cw, ch, bx, by, bw, bh });

export const LOBBY_ART = {
  /* ----- CURRENT lobby (straight-on layered set, one shared 1672×941
   * canvas): empty table + side bars + centre frame. The overlays are
   * painted FULL-STAGE (their canvas IS the stage), so their bboxes are
   * informational — placement math lives in lobbyLayout.ts Rects. */
  backgroundEmpty: art('Background Empty.png', 1672, 941, 0, 0, 1672, 941),
  sideBars: art('Side Bards Frames.png', 1672, 941, 102, 46, 1467, 813),
  centerFrame: art('Center Frame.png', 1672, 941, 288, 24, 1095, 899),

  /* ----- legacy tilted-table lobby (kept for reference) ----- */
  background: art('Background.png', 1672, 941, 0, 0, 1672, 941),
  /* 21:9 master background — its CENTRE 16:9 region is the same composition
   * as Background.png, so stage coordinates are identical; wider viewports
   * just reveal more of the sides. */
  background219: art('Background219.png', 1915, 821, 0, 0, 1915, 821),

  frameLeft: art('Player Frame Tilted Left.png', 1672, 941, 479, 290, 702, 355),
  frameRight: art('Player Frame Tilted Right.png', 1672, 941, 479, 290, 702, 355),
  frameFlat: art('Player Frame.png', 1672, 941, 326, 188, 1020, 565),

  settings: art('Settings Tilted.png', 1086, 1448, 48, 160, 993, 1111),
  settingsFlat: art('Settings.png', 1086, 1448, 54, 94, 979, 1261),

  start: art('Button Start Game Tilted.png', 2172, 724, 443, 168, 1282, 378),
  startFlat: art('Button Start Game.png', 2172, 724, 199, 96, 1774, 529),

  addLeft: art('add player Tilted Left.png', 1254, 1254, 594, 588, 67, 77),
  addRight: art('add player Tilted Right.png', 1254, 1254, 593, 588, 67, 77),
  addFlat: art('add player.png', 1254, 1254, 106, 82, 1042, 1090),

  removeLeft: art('remove player Tilted Left.png', 1254, 1254, 590, 565, 73, 76),
  removeRight: art('remove player Tilted Right.png', 1254, 1254, 591, 565, 73, 76),
  removeFlat: art('remove player.png', 1254, 1254, 135, 157, 921, 919),
} as const;

/** Aspect ratio of the art's OPAQUE region — size widget boxes with this. */
export const artAspect = (a: LobbyArt) => a.bw / a.bh;

/**
 * Style that fills the element with the art's opaque bbox (background sprite
 * crop). The element should be sized to `artAspect()` so nothing distorts.
 */
export function artStyle(a: LobbyArt): CSSProperties {
  return {
    backgroundImage: `url("${a.url}")`,
    backgroundSize: `${(a.cw / a.bw) * 100}% ${(a.ch / a.bh) * 100}%`,
    backgroundPosition: `${a.cw === a.bw ? 50 : (a.bx / (a.cw - a.bw)) * 100}% ${
      a.ch === a.bh ? 50 : (a.by / (a.ch - a.bh)) * 100
    }%`,
    backgroundRepeat: 'no-repeat',
    aspectRatio: `${a.bw} / ${a.bh}`,
  };
}
