import React from 'react';
import { useTargetable, useTargeting, tkey } from './targeting';

/** does this targeting request involve the local hand (a hand card as the
 *  action's source, or hand cards among its targets)? Then the fan must be
 *  OPEN so the player can see/pick them — hover alone can't be relied on. */
const involvesHand = (keys: readonly string[]) =>
  keys.some((k) => k.startsWith('handCard:'));

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

export default function PlayerHand({
  cards,
  anchorCenterCqw,
  playable,
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
  /** normal-mode click per card index (starting that card's action) —
   *  only wired on cards whose `playable` flag is true */
  onActivateCard?: (index: number) => void;
  /** the closed-stack widget the fan is anchored to (e.g. <HandCount/>) */
  children: React.ReactNode;
}) {
  // While a targeting request points INTO the hand (source or targets are
  // hand cards) the fan is forced open — otherwise it's hover-driven.
  const { active } = useTargeting();
  const forcedOpen =
    !!active && involvesHand([active.source, ...active.targets]);

  // When a hand-involving request ENDS (you picked a card in the fan, or an
  // action sourced from the hand resolved), the cursor is still sitting over
  // the open fan — plain group-hover would keep it hanging open. Suppress the
  // hover-open until the pointer leaves the hand, so the pick visibly CLOSES
  // the fan; the next deliberate hover re-opens it.
  const [suppressed, setSuppressed] = React.useState(false);
  const wasForcedOpen = React.useRef(forcedOpen);
  React.useEffect(() => {
    if (wasForcedOpen.current && !forcedOpen) setSuppressed(true);
    wasForcedOpen.current = forcedOpen;
  }, [forcedOpen]);

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
      onMouseLeave={() => setSuppressed(false)}
    >
      {children}

      {/* fan anchor: low on the slot, overlapping the stack */}
      <div
        className={`absolute bottom-[12%] left-1/2 transition-all duration-200 ease-out ${
          forcedOpen
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : suppressed
              ? 'pointer-events-none translate-y-[1.5cqh] scale-95 opacity-0'
              : 'pointer-events-none translate-y-[1.5cqh] scale-95 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100'
        }`}
        style={{ marginLeft: `-${shiftLeft}cqw` }}
      >
        <div className="relative w-px" style={{ height: `${CARD_H_CQH}cqh` }}>
          {cards.map((src, i) => (
            <div
              key={`${src}-${i}`}
              className="absolute bottom-0 left-1/2 h-full hover:z-[70]"
              style={{
                transform: `translateX(calc(-50% + ${
                  (i - mid) * nudge
                }cqw)) rotate(${(i - mid) * step}deg)`,
                transformOrigin: `50% ${PIVOT * 100}%`,
                zIndex: i,
              }}
            >
              <FanCard
                src={src}
                index={i}
                playable={playable?.[i]}
                onActivate={
                  playable?.[i] && onActivateCard
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
  playable,
  onActivate,
}: {
  src: string;
  index: number;
  playable?: boolean;
  /** normal-mode click (starting this card's action) */
  onActivate?: () => void;
}) {
  const t = useTargetable(tkey.handCard(index), onActivate);
  // dimmed cards are background while an action is aiming — no hover grow
  const dimmed = t.targeting && t.mode === 'dimmed';
  return (
    <img
      src={src}
      alt={`hand card ${index + 1}`}
      draggable={false}
      onClick={t.onClick}
      className={`h-full max-w-none origin-bottom select-none rounded-[0.4cqw] shadow-[-0.3cqw_0.3cqw_1cqw_rgba(0,0,0,0.7)] transition-transform duration-150${
        dimmed ? '' : ' hover:scale-[1.6]'
      }${playable ? ' card-aura' : ''} ${t.className}`}
    />
  );
}
