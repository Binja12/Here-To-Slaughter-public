import AssetImage from '../loading/AssetImage'
import CardReactionTimer from './CardReactionTimer';
import React from 'react';
import { useTargetable, useTargeting, tkey } from './targeting';
import { useAudio } from '../audio/AudioProvider';

/**
 * The local player's hand (bottom seat ONLY — opponents just show their
 * face-down stack + count).
 *
 * Hovering the hand stack opens a fan of the actual cards shaped like a
 * real held hand (reference photo): cards rotate around a pivot far below
 * the fan — the "wrist" (origin 50% 200%) — producing a wide arc whose
 * bottoms converge toward the grip. On top of the arc, a computed
 * horizontal nudge tops the spacing up so ~70% OF EVERY CARD STAYS
 * VISIBLE (`VISIBLE`), regardless of hand size. The whole fan is clamped
 * to the board's right edge (it is anchored near the right side), sliding
 * left just enough to stay on the table when the hand is wide.
 *
 * Placement (translate + rotate) lives on a WRAPPER div; the hover zoom
 * (6x the original bump = scale 1.6) lives on the img inside and grows
 * UPWARD (`origin-bottom`), so zooming can never wipe the fan transform
 * (that bug made cards jump sideways once).
 */

const CARD_H_CQH = 28; // fan card height
const CARD_H_CQW = CARD_H_CQH * 0.5625; // board is 16:9 → 1cqh = 0.5625cqw
const CARD_W_CQW = CARD_H_CQW * 0.716; // ≈ 11.3cqw (scan aspect)
// target uncovered fraction per card; slightly above 0.7 because the
// rotation-spread estimate runs ~5% hot vs the rendered result
const VISIBLE = 0.75;
const PIVOT = 2.0; // transform-origin y, in card heights (the "wrist")
const RIGHT_EDGE_CQW = 98; // clamp: fan may not pass this board x
/** how long the fan stays open on its own after a card arrives */
const PEEK_MS = 3000;

export default function PlayerHand({
  cards,
  anchorCenterCqw,
  playable,
  asked,
  onActivateCard,
  children,
}: {
  /** image urls of the cards in hand, left to right */
  cards: string[];
  /** board-x (cqw) of the hand slot's center — used to clamp the fan */
  anchorCenterCqw: number;
  /** per-card playable flags, index-aligned with `cards` — true cards get
   *  the green Hearthstone aura (modifiers/challenges can glow off-turn) */
  playable?: boolean[];
  /** per-card: the engine's open yes/no is ABOUT this card ("play the hero
   *  you just drew?" — Mellow Dee): gold ask-aura, pressing it says yes */
  asked?: boolean[];
  /** normal-mode click per card index (starting that card's action) —
   *  wired on cards whose `playable` or `asked` flag is true */
  onActivateCard?: (index: number) => void;
  /** the closed-stack widget the fan is anchored to (e.g. <HandCount/>) */
  children: React.ReactNode;
}) {
  // Fan-open control while a request runs:
  //  - the fan opens only from hover over the stack/fan.
  //  - it is forced CLOSED (and ignores hover) when a HAND card is aiming at
  //    the BOARD (challenge/modifier/magic picking its target): the open fan
  //    would cover the targets. It re-opens on the next hover once the
  //    request ends (pick or cancel).
  const { active } = useTargeting();
  const forcedClosed = !!active && active.source.startsWith('handCard:');
  // A card arriving opens the fan by itself for PEEK_MS (the owner,
  // 2026-09-05). The cursor coming onto the hand hands control back to the
  // hover: the fan then stays as long as the hand is hovered and closes
  // when it is left, peek or no peek.
  const [peeking, setPeeking] = React.useState(false);
  const count = cards.length;
  const lastCount = React.useRef(count);
  React.useEffect(() => {
    const grew = count > lastCount.current;
    lastCount.current = count;
    if (!grew) return;
    setPeeking(true);
    const timer = window.setTimeout(() => setPeeking(false), PEEK_MS);
    return () => window.clearTimeout(timer);
  }, [count]);
  const peekOpen = peeking && !forcedClosed;
  // Which card the cursor is over, judged by the cells' RESTING boxes: the
  // enlarged image is a child of its cell, so DOM hover alone would keep a
  // card zoomed while the cursor sits on the enlarged part outside where
  // the card lies. The cell on top at rest (highest index) wins overlaps.
  const [hovered, setHovered] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (forcedClosed) setHovered(null);
  }, [forcedClosed]);
  const cellRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const hitTest = (event: React.MouseEvent) => {
    if (forcedClosed) return;
    let hit: number | null = null;
    cellRefs.current.forEach((cell, i) => {
      if (!cell) return;
      const r = cell.getBoundingClientRect();
      if (
        event.clientX >= r.left &&
        event.clientX <= r.right &&
        event.clientY >= r.top &&
        event.clientY <= r.bottom
      ) {
        hit = i;
      }
    });
    setHovered((current) => (current === hit ? current : hit));
  };

  const n = cards.length;
  const mid = (n - 1) / 2;

  // wide photo-like arc, capped at ±28° for big hands
  const step = n > 1 ? Math.min(9, 56 / (n - 1)) : 0;
  // horizontal displacement the rotation alone gives a card's mid-height
  const rotSpread =
    (PIVOT - 0.5) * CARD_H_CQW * Math.sin((step * Math.PI) / 180);
  // top up with a straight nudge until neighbors sit 70% of a card apart
  const gap = VISIBLE * CARD_W_CQW;
  const nudge = Math.max(0, gap - rotSpread);

  // keep the (possibly very wide) fan on the board
  const fanHalf = ((n - 1) * gap + CARD_W_CQW) / 2;
  const shiftLeft = Math.max(0, anchorCenterCqw + fanHalf - RIGHT_EDGE_CQW);

  return (
    <div
      className="group hand-group relative h-full w-full"
      onMouseEnter={() => setPeeking(false)}
    >
      {children}

      {/* fan anchor: low on the slot, overlapping the stack */}
      <div
        className={`absolute bottom-[12%] left-1/2 transition-all duration-200 ease-out ${
          forcedClosed
            ? 'pointer-events-none translate-y-[1.5cqh] scale-95 opacity-0'
            : peekOpen
              ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
              : 'pointer-events-none translate-y-[1.5cqh] scale-95 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100'
        }`}
        style={{ marginLeft: `-${shiftLeft}cqw` }}
      >
        <div
          className="relative w-px"
          style={{ height: `${CARD_H_CQH}cqh` }}
          onMouseMove={hitTest}
          onMouseLeave={() => setHovered(null)}
        >
          {cards.map((src, i) => (
            // The zoom follows the cell's RESTING box (hitTest above), so it
            // ends the moment the cursor leaves where the card sits
            // (the owner, 2026-09-03). The hovered cell's z is set INLINE —
            // a `hover:` class cannot beat the inline base z, which let the
            // next card paint over the zoomed one.
            <div
              key={`${src}-${i}`}
              ref={(element) => {
                cellRefs.current[i] = element;
              }}
              className="absolute bottom-0 left-1/2 h-full"
              style={{
                transform: `translateX(calc(-50% + ${
                  (i - mid) * nudge
                }cqw)) rotate(${(i - mid) * step}deg)`,
                transformOrigin: `50% ${PIVOT * 100}%`,
                zIndex: hovered === i ? 999 : i,
              }}
            >
              <FanCard
                src={src}
                index={i}
                hovered={hovered === i && !forcedClosed}
                playable={playable?.[i]}
                asked={asked?.[i]}
                onActivate={
                  (playable?.[i] || asked?.[i]) && onActivateCard
                    ? () => onActivateCard(i)
                    : undefined
                }
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** one card in the open fan — targetable so actions can pick FROM the hand
 *  (e.g. "discard a card", challenge/modifier selection during windows). */
function FanCard({
  src,
  index,
  hovered = false,
  playable,
  asked = false,
  onActivate,
}: {
  src: string;
  index: number;
  /** the cell (resting footprint) is under the cursor — grow */
  hovered?: boolean;
  playable?: boolean;
  /** the open yes/no is about this card: gold, pressing = yes */
  asked?: boolean;
  /** normal-mode click (starting this card's action) */
  onActivate?: () => void;
}) {
  const t = useTargetable(tkey.handCard(index), onActivate);
  // dimmed cards are background while an action is aiming — no hover grow
  const dimmed = t.targeting && t.mode === 'dimmed';
  const { playSound } = useAudio();
  const zoomed = hovered && !dimmed;
  // Follow the same resting-box selection as the zoom: one rustle per
  // card entered, with no delay or repeats while moving within that card.
  React.useEffect(() => {
    if (zoomed) playSound('discardHover');
  }, [zoomed, playSound]);
  return (
    <div
      onClick={t.onClick}
      className={`relative h-full w-full origin-bottom select-none rounded-[0.4cqw] shadow-[-0.3cqw_0.3cqw_1cqw_rgba(0,0,0,0.7)] transition-transform duration-[120ms] ease-out${
        asked ? ' ask-aura' : playable ? ' card-aura' : ''
      } ${t.className}`}
      style={{ width: `${CARD_W_CQW}cqw`, transform: zoomed ? 'scale(1.6)' : undefined }}
    >
      <AssetImage src={src} alt={`hand card ${index + 1}`} draggable={false} className="h-full w-full rounded-[0.4cqw] object-fill" />
      <CardReactionTimer handIndex={index} zoomed={zoomed} />
    </div>
  );
}
