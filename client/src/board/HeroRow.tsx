import React from "react";
import FramedCard from "./FramedCard";
import { boardHeroCardUrl, boardItemUrl, BOARD_CARD_ASPECT } from "./assets";
import { useHoverZoom } from "./useHoverZoom";
import { useTargetable, TargetKey } from "./targeting";

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
 * Hover ZOOM: the hovered card scales up (managed by useHoverZoom, which keeps
 * it open within 90% of the scaled box and cancels on right-click). bottom/top
 * grow from their edge's centre (never leaves the top/bottom edge). left/right
 * grow mostly inward but only HALFWAY toward centre (25%/75%, not a full
 * 0%/100% edge-pin) — a full edge-pin made the zoom feel like it was
 * ballooning entirely toward the board centre.
 */

export interface HeroInPlay {
  slug: string;
  /** shared HeroClass enum value, e.g. "Ranger" — picks the class frame. */
  heroClass: string;
  /** display name of an item card attached to this hero (e.g. "Thief Mask"),
   *  tucked behind the hero and revealed to the side on hover. */
  item?: string;
}

export type Seat = "bottom" | "top" | "left" | "right";

const SEAT_CONFIG: Record<
  Seat,
  { variant: "main" | "side"; origin: string; fanFrom: number }
> = {
  bottom: { variant: "main", origin: "50% 100%", fanFrom: 5 },
  top: { variant: "main", origin: "50% 0%", fanFrom: 5 },
  left: { variant: "side", origin: "25% 50%", fanFrom: 4 },
  right: { variant: "side", origin: "75% 50%", fanFrom: 4 },
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
  className = "",
  chainGroup,
  item,
  itemSide = "right",
  playable = false,
  targetKey,
  onActivate,
}: {
  slug: string;
  heroClass?: string;
  /** true when this card partially covers the one to its left */
  overlapped?: boolean;
  /** CSS transform-origin ("x% y%") for the hover zoom — points toward centre */
  origin: string;
  zoom: number;
  className?: string;
  /** shared id (e.g. per-seat hero row) enabling zero-delay chaining between
   *  cards in the same group; omit to keep this card's delay unconditional. */
  chainGroup?: string;
  /** display name of an attached item card, tucked behind the hero. */
  item?: string;
  /** which side the item slides out to on hover — counter to the hero's own
   *  x on the board, so it reveals toward open space, never off the edge. */
  itemSide?: "left" | "right";
  /** true → this hero has an available action; shows the green playable aura */
  playable?: boolean;
  /** this hero's identity for targeting mode — the container (hero + tucked
   *  item) dims/glows as one unit */
  targetKey?: TargetKey;
  /** clicked in normal mode (e.g. hero starting its own ability) */
  onActivate?: () => void;
}) {
  // Overlapped cards throw their shadow LEFT, onto the card they cover.
  const shadow = overlapped
    ? "shadow-[-0.45cqw_0.25cqw_0.9cqw_rgba(0,0,0,0.65)]"
    : "shadow-[0.15cqw_0.3cqw_0.8cqw_rgba(0,0,0,0.7)]";

  const boardUrl = boardHeroCardUrl(slug);
  const itemRef = React.useRef<HTMLDivElement>(null);
  const getItemElement = React.useCallback(
    () => (itemRef.current ? [itemRef.current] : []),
    [],
  );
  const hz = useHoverZoom<HTMLDivElement>(chainGroup, getItemElement);
  const t = useTargetable(targetKey, onActivate);
  // dimmed heroes are background while an action is aiming — no hover zoom
  const dimmed = t.targeting && t.mode === "dimmed";
  const zoomed = hz.active && !dimmed;
  const itemUrl = item ? boardItemUrl(item) : null;

  // Revealed item is 80% of the hero's zoomed size, sitting flush BESIDE the
  // zoomed hero: both grow from the same `origin`, so with x-origin at 50% the
  // gap between their centres to make their inner edges touch is
  // (heroScale + itemScale) / 2 card-widths (minus a hair for a slight, glued
  // overlap). translateX %s are relative to the item's own (unscaled) width.
  const itemScale = zoom * 0.8;
  const itemShiftPct = ((zoom + itemScale) / 2 - 0.12) * 100;

  // The zooming hero lives in its OWN inner layer (hz.ref) so it can scale
  // freely; the attached item is a SIBLING that must not inherit that scale,
  // so both sit inside a plain sizing box. At rest the item is tucked behind
  // the hero (painted first, DOM order) and dropped 10% so a tenth of it peeks
  // out below. On hover it lifts above the hero (z) and slides out to
  // `itemSide`, enlarged to 80% of the zoomed hero at the hero's own y.
  return (
    <div
      className={`relative h-[92%] ${className} ${t.className}`}
      style={{ aspectRatio: String(BOARD_CARD_ASPECT) }}
      onClick={t.onClick}
    >
      {itemUrl && (
        <div
          ref={itemRef}
          className="pointer-events-none absolute inset-0 rounded-[0.5cqw] shadow-[0.15cqw_0.3cqw_0.8cqw_rgba(0,0,0,0.7)] transition-transform duration-200 ease-out"
          style={{
            zIndex: zoomed ? 40 : undefined,
            transformOrigin: origin,
            transform: zoomed
              ? `translateX(${
                  itemSide === "left" ? "-" : ""
                }${itemShiftPct}%) scale(${itemScale})`
              : "translateY(10%)",
          }}
        >
          <img
            src={itemUrl}
            alt={item}
            draggable={false}
            className="absolute inset-0 h-full w-full select-none rounded-[0.5cqw] object-fill"
          />
        </div>
      )}

      <div
        ref={hz.ref}
        className={`absolute inset-0 ${shadow} rounded-[0.5cqw] transition-transform duration-150`}
        style={{
          transformOrigin: origin,
          transform: zoomed ? `scale(${zoom})` : undefined,
        }}
        onMouseEnter={dimmed ? undefined : hz.onMouseEnter}
        onMouseLeave={hz.onMouseLeave}
        onContextMenu={hz.onContextMenu}
      >
        {boardUrl ? (
          // absolute so the intrinsic image width doesn't inflate the grid's
          // max-content column (that made the last fan card render huge)
          <img
            src={boardUrl}
            alt={slug}
            draggable={false}
            className={`absolute inset-0 h-full w-full select-none rounded-[0.5cqw] object-fill${
              playable ? " card-aura" : ""
            }`}
          />
        ) : (
          <FramedCard
            slug={slug}
            heroClass={heroClass}
            className={`absolute inset-0 h-full w-full${
              playable ? " card-aura" : ""
            }`}
          />
        )}
      </div>
    </div>
  );
}

export default function HeroRow({
  heroes,
  seat = "bottom",
  playable,
  targetKeyFor,
  onActivateFor,
}: {
  heroes: HeroInPlay[];
  seat?: Seat;
  /** per-hero playable flags, index-aligned with `heroes` (local seat only —
   *  omit for opponents, nothing glows) */
  playable?: boolean[];
  /** targeting identity per hero index (e.g. i => tkey.hero("p2", i)) so
   *  individual heroes can be picked as action targets */
  targetKeyFor?: (index: number) => TargetKey;
  /** normal-mode click per hero index (starting that hero's ability / dice
   *  throw) — wired on EVERY hero when provided, regardless of `playable` */
  onActivateFor?: (index: number) => void;
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
              i > 0 ? "ml-[0.4cqw]" : ""
            }`}
          >
            <HeroCardWidget
              slug={hero.slug}
              heroClass={hero.heroClass}
              origin={origin}
              zoom={zoom}
              chainGroup={`hero-row-${seat}`}
              item={hero.item}
              itemSide={i <= (n - 1) / 2 ? "right" : "left"}
              playable={playable?.[i]}
              targetKey={targetKeyFor?.(i)}
              onActivate={onActivateFor ? () => onActivateFor(i) : undefined}
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
            e.currentTarget.style.zIndex = "999";
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
            chainGroup={`hero-row-${seat}`}
            item={hero.item}
            itemSide={i <= (n - 1) / 2 ? "right" : "left"}
            playable={playable?.[i]}
            targetKey={targetKeyFor?.(i)}
            onActivate={onActivateFor ? () => onActivateFor(i) : undefined}
          />
        </div>
      ))}
    </div>
  );
}
