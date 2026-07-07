import React from 'react';
import FramedCard from './FramedCard';
import { boardHeroCardUrl, BOARD_CARD_ASPECT } from './assets';

/**
 * Hero widget: the played hero/item cards of one seat, laid over the
 * background's hero strip. On the board we use the BOARD card design
 * (premium scans in /board/heroes/ with the ornate frame already baked in);
 * when a board scan is missing we fall back to FramedCard (hand scan + class
 * frame overlay).
 *
 * Overflow: cards NEVER change size at rest. Below the fan threshold they sit
 * side by side; from the threshold up they become a straight fan via a CSS
 * grid `repeat(n-1, 1fr) max-content` — each card at an equal share of the
 * width, last card fully visible, zIndex = index (right covers left).
 *
 * Hover ZOOM: like the hand fan, the hovered card scales up a lot. The scale
 * origin is edge-aware per seat so the enlarged card never leaves the screen:
 * bottom grows up, top grows down, sides grow up-and-inward.
 */

export interface HeroInPlay {
  slug: string;
  /** shared HeroClass enum value, e.g. "Ranger" — picks the class frame. */
  heroClass: string;
}

export type Seat = 'bottom' | 'top' | 'left' | 'right';

const SEAT_CONFIG: Record<
  Seat,
  { variant: 'main' | 'side'; origin: string; fanFrom: number }
> = {
  bottom: { variant: 'main', origin: 'origin-bottom', fanFrom: 5 },
  top: { variant: 'main', origin: 'origin-top', fanFrom: 5 },
  left: { variant: 'side', origin: 'origin-bottom-left', fanFrom: 4 },
  right: { variant: 'side', origin: 'origin-bottom-right', fanFrom: 4 },
};

/** How big the hovered card grows. Sides are smaller at rest (narrow
 * strips) so they need a LARGER zoom to read as well as top/bottom. */
const ZOOM = { main: 2.3, side: 3.2 };

export function HeroCardWidget({
  slug,
  heroClass,
  overlapped = false,
  origin,
  zoom,
  className = '',
}: {
  slug: string;
  heroClass?: string;
  /** true when this card partially covers the one to its left */
  overlapped?: boolean;
  /** tailwind transform-origin class for the hover zoom */
  origin: string;
  zoom: number;
  className?: string;
}) {
  // Overlapped cards throw their shadow LEFT, onto the card they cover.
  const shadow = overlapped
    ? 'shadow-[-0.45cqw_0.25cqw_0.9cqw_rgba(0,0,0,0.65)]'
    : 'shadow-[0.15cqw_0.3cqw_0.8cqw_rgba(0,0,0,0.7)]';

  const boardUrl = boardHeroCardUrl(slug);

  // One wrapper owns sizing + the edge-aware hover zoom; either the board
  // scan (frame baked in) or the FramedCard fallback fills it. Zoom is an
  // inline transform so the scale value can vary per seat without needing
  // build-time Tailwind arbitrary values.
  return (
    <div
      className={`relative h-[92%] ${origin} ${shadow} rounded-[0.5cqw] transition-transform duration-150 ${className}`}
      style={{ aspectRatio: String(BOARD_CARD_ASPECT) }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = `scale(${zoom})`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = '';
      }}
    >
      {boardUrl ? (
        // absolute so the intrinsic image width doesn't inflate the grid's
        // max-content column (that made the last fan card render huge)
        <img
          src={boardUrl}
          alt={slug}
          draggable={false}
          className="absolute inset-0 h-full w-full select-none rounded-[0.5cqw] object-fill"
        />
      ) : (
        <FramedCard
          slug={slug}
          heroClass={heroClass}
          className="absolute inset-0 h-full w-full"
        />
      )}
    </div>
  );
}

export default function HeroRow({
  heroes,
  seat = 'bottom',
}: {
  heroes: HeroInPlay[];
  seat?: Seat;
}) {
  const { variant, origin, fanFrom } = SEAT_CONFIG[seat];
  const zoom = ZOOM[variant];
  const n = heroes.length;
  const fanned = n >= fanFrom;

  if (!fanned) {
    return (
      <div className="flex h-full w-full items-center justify-center px-[0.5cqw]">
        {heroes.map((hero, i) => (
          <div
            key={`${hero.slug}-${i}`}
            className={`relative flex h-full shrink-0 items-center justify-center hover:z-[60] ${
              i > 0 ? 'ml-[0.4cqw]' : ''
            }`}
          >
            <HeroCardWidget
              slug={hero.slug}
              heroClass={hero.heroClass}
              origin={origin}
              zoom={zoom}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid h-full w-full items-center px-[0.7cqw]"
      style={{
        // n-1 equal shares + the last card fully visible at the right edge
        gridTemplateColumns: `repeat(${n - 1}, minmax(0, 1fr)) max-content`,
      }}
    >
      {heroes.map((hero, i) => (
        <div
          key={`${hero.slug}-${i}`}
          className="relative flex h-full w-max items-center"
          // base z rises left→right so right cards cover left ones; on hover
          // we jump to 999 INLINE (a `hover:` class can't win against the
          // inline base z, which is why hovered cards were still obstructed).
          style={{ zIndex: i }}
          onMouseEnter={(e) => {
            e.currentTarget.style.zIndex = '999';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.zIndex = String(i);
          }}
        >
          <HeroCardWidget
            slug={hero.slug}
            heroClass={hero.heroClass}
            overlapped={i > 0}
            origin={origin}
            zoom={zoom}
          />
        </div>
      ))}
    </div>
  );
}
