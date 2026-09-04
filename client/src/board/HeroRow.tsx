import React from "react";
import { artFor, BOARD_CARD_ASPECT } from "./assets";
import { useHoverZoom } from "./useHoverZoom";
import { useTargetable, TargetKey } from "./targeting";
import { CardView } from "../contract";

/**
 * Hero widget: the played hero/item cards of one seat, laid over the
 * background's hero strip, drawn from the BOARD card design (premium scans
 * in /board/heroes/ with the ornate frame already baked in).
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
  card: CardView;
  equippedItem?: CardView;
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
  card,
  overlapped = false,
  origin,
  zoom,
  className = "",
  chainGroup,
  item,
  itemSide = "right",
  itemPlayable = false,
  playable = false,
  asked = false,
  enemy = false,
  passive = false,
  itemPassive = false,
  itemEnemy = false,
  targetKey,
  itemTargetKey,
  onActivate,
  onZoomChange,
}: {
  card: CardView;
  /** true when this card partially covers the one to its left */
  overlapped?: boolean;
  /** CSS transform-origin ("x% y%") for the hover zoom — points toward centre */
  origin: string;
  zoom: number;
  className?: string;
  /** shared id (e.g. per-seat hero row) enabling zero-delay chaining between
   *  cards in the same group; omit to keep this card's delay unconditional. */
  chainGroup?: string;
  /** attached item card, tucked behind the hero. */
  item?: CardView;
  /** which side the item slides out to on hover — counter to the hero's own
   *  x on the board, so it reveals toward open space, never off the edge. */
  itemSide?: "left" | "right";
  /** true when the attached item is the affected reaction card. */
  itemPlayable?: boolean;
  /** true → this hero has an available action; shows the green playable aura */
  playable?: boolean;
  /** true → an optional question is about this hero ("roll on it?") or its
   *  standing effect feeds the open roll: gold aura */
  asked?: boolean;
  /** true → an opponent is acting with this hero right now: red aura */
  enemy?: boolean;
  /** true → this hero's standing effect is live right now: pink aura (the
   *  quietest tone — red, gold and green all say something more urgent) */
  passive?: boolean;
  /** true → the equipped item's effect is working right now: pink */
  itemPassive?: boolean;
  /** true → an opponent is playing this item right now (its challenge is open): red */
  itemEnemy?: boolean;
  /** this hero's identity for targeting mode — the container (hero + tucked
   *  item) dims/glows as one unit */
  targetKey?: TargetKey;
  /** independent targeting identity for the equipped item. */
  itemTargetKey?: TargetKey;
  /** clicked in normal mode (e.g. hero starting its own ability) */
  onActivate?: () => void;
  /** the row raises this card's cell above its neighbours while zoomed */
  onZoomChange?: (zoomed: boolean) => void;
}) {
  // Overlapped cards throw their shadow LEFT, onto the card they cover.
  const shadow = overlapped
    ? "shadow-[-0.45cqw_0.25cqw_0.9cqw_rgba(0,0,0,0.65)]"
    : "shadow-[0.15cqw_0.3cqw_0.8cqw_rgba(0,0,0,0.7)]";

  const boardUrl = artFor(card).url;
  const itemRef = React.useRef<HTMLDivElement>(null);
  const getItemElement = React.useCallback(
    () => (itemRef.current ? [itemRef.current] : []),
    [],
  );
  const hz = useHoverZoom<HTMLDivElement>(chainGroup, getItemElement);
  const t = useTargetable(targetKey, onActivate);
  const itemTarget = useTargetable(itemTargetKey);
  // dimmed heroes are background while an action is aiming — no hover zoom
  const dimmed = t.targeting && t.mode === "dimmed";
  const itemIsTarget = itemTarget.mode === "target";
  const heroZoomed = hz.active && !dimmed;
  const itemUrl = item ? artFor(item).url : null;
  React.useEffect(() => {
    onZoomChange?.(heroZoomed);
  }, [heroZoomed, onZoomChange]);

  // Revealed item is 80% of the hero's zoomed size, sitting flush BESIDE the
  // zoomed hero: both grow from the same `origin`, so with x-origin at 50% the
  // gap between their centres to make their inner edges touch is
  // (heroScale + itemScale) / 2 card-widths (minus a hair for a slight, glued
  // overlap). translateX %s are relative to the item's own (unscaled) width.
  const itemScale = zoom * 0.8;
  const itemShiftPct = ((zoom + itemScale) / 2 - 0.12) * 100;

  // The zooming hero lives in its OWN inner layer (hz.ref) so it can scale
  // freely; the attached item is a SIBLING that must not inherit that scale,
  // so both sit inside a plain sizing box. At rest the item STAYS tucked
  // behind the hero (painted first, DOM order), dropped 10% so a tenth of it
  // peeks out below — when it is playable or a target only that strip glows
  // (the owner: "just make the card glow but keep it under the hero"). Only
  // while the hero is zoomed does it lift above the hero (z) and slide out to
  // `itemSide`, enlarged to 80% of the zoomed hero, whole card glowing, and
  // clickable — hovering it keeps the hero zoomed (useHoverZoom companions),
  // which is how an item gets picked.
  return (
    <div
      className={`relative h-[92%] ${className}`}
      style={{ aspectRatio: String(BOARD_CARD_ASPECT) }}
    >
      {itemUrl && (
        <div
          ref={itemRef}
          className={`absolute inset-0 rounded-[0.5cqw] shadow-[0.15cqw_0.3cqw_0.8cqw_rgba(0,0,0,0.7)] transition-transform duration-[120ms] ease-out ${
            itemIsTarget || heroZoomed ? "pointer-events-auto" : "pointer-events-none"
          }${itemEnemy ? " enemy-aura" : itemPlayable ? " card-aura" : itemPassive ? " passive-aura" : ""} ${itemTarget.className}`}
          style={{
            // a TARGET item comes out on top of its hero as well: tucked
            // under it, only a 10% strip could be pressed and the hero (or a
            // neighbour) took the click (the owner, 2026-09-04, challenging
            // an item just played)
            zIndex: heroZoomed || itemIsTarget ? 40 : undefined,
            transformOrigin: origin,
            transform: heroZoomed
              ? `translateX(${
                  itemSide === "left" ? "-" : ""
                }${itemShiftPct}%) scale(${itemScale})`
              : "translateY(10%)",
          }}
          onClick={itemTarget.onClick}
        >
          <img
            src={itemUrl}
            alt={item?.name}
            draggable={false}
            className="absolute inset-0 h-full w-full select-none rounded-[0.5cqw] object-fill"
          />
        </div>
      )}

      <div
        ref={hz.ref}
        className={`absolute inset-0 ${shadow} rounded-[0.5cqw] transition-transform duration-[120ms] ease-out ${t.className}`}
        style={{
          transformOrigin: origin,
          transform: heroZoomed ? `scale(${zoom})` : undefined,
        }}
        onMouseEnter={dimmed ? undefined : hz.onMouseEnter}
        onMouseLeave={hz.onMouseLeave}
        onContextMenu={hz.onContextMenu}
        onClick={t.onClick}
      >
        <img
          src={boardUrl}
          alt={card.name}
          draggable={false}
          className={`absolute inset-0 h-full w-full select-none rounded-[0.5cqw] object-fill${
            enemy ? " enemy-aura" : asked ? " ask-aura" : playable ? " card-aura" : passive ? " passive-aura" : ""
          }`}
        />
      </div>
    </div>
  );
}

export default function HeroRow({
  heroes,
  seat = "bottom",
  playable,
  asked,
  enemy,
  passive,
  itemPlayable,
  itemPassive,
  itemEnemy,
  targetKeyFor,
  itemTargetKeyFor,
  onActivateFor,
}: {
  heroes: HeroInPlay[];
  seat?: Seat;
  /** per-hero "an opponent acts with this one" (red) and "its item feeds
   *  the open roll" (gold) flags */
  enemy?: boolean[];
  /** per-hero "its standing effect is live" flags (pink), every seat */
  passive?: boolean[];
  /** per-hero "its item's effect is working" flags (pink) */
  itemPassive?: boolean[];
  /** per-hero "an opponent is playing its item right now" flags (red) */
  itemEnemy?: boolean[];
  /** per-hero playable flags, index-aligned with `heroes` (local seat only —
   *  omit for opponents, nothing glows) */
  playable?: boolean[];
  /** per-hero "an optional question is about this one" flags — gold aura,
   *  pressing answers yes (see HeroCardWidget.asked) */
  asked?: boolean[];
  /** reaction-highlight flags for equipped items, index-aligned. */
  itemPlayable?: boolean[];
  /** targeting identity per hero index (e.g. i => tkey.hero("p2", i)) so
   *  individual heroes can be picked as action targets */
  targetKeyFor?: (index: number) => TargetKey;
  /** targeting identity for each hero's equipped item. */
  itemTargetKeyFor?: (index: number) => TargetKey;
  /** normal-mode click per hero index (starting that hero's ability / dice
   *  throw) — wired on EVERY hero when provided, regardless of `playable` */
  onActivateFor?: (index: number) => void;
}) {
  const { variant, origin, fanFrom } = SEAT_CONFIG[seat];
  const zoom = ZOOM[variant];
  const n = heroes.length;
  const fanned = n >= fanFrom;
  // The ZOOMED card's cell is raised above its neighbours — by zoom state,
  // not by hover: while the cursor is on the slid-out item the cell itself
  // is no longer hovered, and a hover-driven z let the next hero paint over
  // the zoomed one (the owner's screenshot, 2026-09-03).
  const [zoomedIndex, setZoomedIndex] = React.useState<number | null>(null);
  const zoomHandlers = React.useMemo(
    () =>
      heroes.map((_, i) => (zoomed: boolean) =>
        setZoomedIndex((current) =>
          zoomed ? i : current === i ? null : current,
        ),
      ),
    [heroes],
  );

  // ONE card, whichever way the row lays it out. The two layouts below differ
  // in geometry only; every flag reaches the card the same way in both, so a
  // row that fans once it fills cannot lose an aura the spread row showed
  // (the owner, 2026-09-04: the fifth hero's roll offer did not glow).
  const cardAt = (i: number, overlapped: boolean) => {
    const hero = heroes[i];
    return (
      <HeroCardWidget
        onZoomChange={zoomHandlers[i]}
        card={hero.card}
        overlapped={overlapped}
        origin={origin}
        zoom={zoom}
        chainGroup={`hero-row-${seat}`}
        item={hero.equippedItem}
        itemSide={i <= (n - 1) / 2 ? "right" : "left"}
        itemPlayable={itemPlayable?.[i]}
        playable={playable?.[i]}
        asked={asked?.[i]}
        enemy={enemy?.[i]}
        passive={passive?.[i]}
        itemPassive={itemPassive?.[i]}
        itemEnemy={itemEnemy?.[i]}
        targetKey={targetKeyFor?.(i)}
        itemTargetKey={itemTargetKeyFor?.(i)}
        onActivate={
          (playable?.[i] || asked?.[i]) && onActivateFor
            ? () => onActivateFor(i)
            : undefined
        }
      />
    );
  };

  if (!fanned) {
    return (
      <div className="flex h-full w-full items-center justify-center px-[0.5cqw]">
        {heroes.map((hero, i) => (
          <div
            key={hero.card.id}
            className={`relative flex h-full shrink-0 items-center justify-center ${
              i > 0 ? "ml-[0.4cqw]" : ""
            }`}
            style={{ zIndex: zoomedIndex === i ? 999 : undefined }}
          >
            {cardAt(i, false)}
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
          key={hero.card.id}
          className="relative flex h-full w-max items-center"
          // base z rises left→right so right cards cover left ones; the
          // zoomed card's cell jumps to 999 (inline — a class can't beat the
          // inline base z) for as long as it is zoomed.
          style={{ zIndex: zoomedIndex === i ? 999 : i }}
        >
          {cardAt(i, i > 0)}
        </div>
      ))}
    </div>
  );
}
