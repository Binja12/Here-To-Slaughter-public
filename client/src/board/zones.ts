/**
 * Zone map for the painted board background (public/board/board-bg.png,
 * 1672x941). Every value is a PERCENTAGE of the board's width/height, so
 * widgets stretch and reposition with the background at any resolution —
 * the board container just has to keep the image filling it 100%/100%.
 *
 * Measured by hand against the art; tweak here if a frame drifts.
 */

export interface Zone {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const ZONES = {
  /* ---- top player (P2) ---- */
  p2Leader: { left: 23.6, top: 1.9, width: 8.3, height: 20.6 },
  p2Heroes: { left: 32.8, top: 3.0, width: 33.7, height: 18.5 },
  p2Hand: { left: 67.3, top: 2.7, width: 8.2, height: 19.9 },

  /* ---- left player (P3) ---- */
  p3Leader: { left: 2.8, top: 30.5, width: 8.7, height: 24.9 },
  p3Hand: { left: 12.0, top: 30.2, width: 8.8, height: 25.2 },
  p3Heroes: { left: 2.6, top: 56.5, width: 20.2, height: 15.0 },

  /* ---- right player (P4) ---- */
  p4Leader: { left: 79.5, top: 30.4, width: 8.3, height: 24.9 },
  p4Hand: { left: 88.9, top: 30.2, width: 8.7, height: 25.1 },
  p4Heroes: { left: 77.3, top: 56.5, width: 20.2, height: 15.3 },

  /* ---- bottom player (P1, local seat) ---- */
  p1Leader: { left: 23.7, top: 74.6, width: 8.1, height: 22.8 },
  p1Heroes: { left: 32.4, top: 74.7, width: 34.0, height: 23.0 },
  p1Hand: { left: 67.3, top: 74.6, width: 8.2, height: 22.8 },

  /* ---- center arena (wooden frame) ---- */
  monster1: { left: 33.1, top: 27.4, width: 7.1, height: 22.0 },
  monster2: { left: 40.7, top: 27.4, width: 7.9, height: 22.0 },
  monster3: { left: 48.9, top: 27.4, width: 7.2, height: 22.0 },
  mainDeck: { left: 32.4, top: 51.9, width: 5.6, height: 18.1 },
  discardPile: { left: 38.3, top: 51.9, width: 5.4, height: 18.1 },
  monsterDeck: { left: 44.8, top: 51.9, width: 5.4, height: 18.1 },
  diceSlot: { left: 50.8, top: 51.9, width: 5.9, height: 18.1 },

  /* ---- right-hand HUD ---- */
  actionPoints: { left: 60.6, top: 24.7, width: 17.6, height: 6.3 },
  turnBanner: { left: 61.5, top: 32.2, width: 13.9, height: 7.3 },
  winConditions: { left: 60.5, top: 41.0, width: 12.4, height: 32.2 },
} satisfies Record<string, Zone>;

export type ZoneName = keyof typeof ZONES;
