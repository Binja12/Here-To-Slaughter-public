import { useCallback, useEffect, useRef, useState } from "react";

const HOVER_DELAY_MS = 100; // a fresh hover must sit this long before it zooms

// CHAINING (Hearthstone-style browse): once you've zoomed a card and then LEAVE
// it, moving straight onto another card in the SAME group should zoom that one
// instantly instead of waiting out HOVER_DELAY_MS again. The window is measured
// from the moment you LEAVE the zoomed card (see `leftZoomedAt`), NOT from when
// it zoomed — so lingering on a card doesn't consume it. Drifting onto the
// background (or any non-card) for longer than this resets the browse, so the
// next card needs a deliberate hover again.
//
// Why not ~0.01s (the "just came off it" feel)? A deactivating card only shrinks
// back on the NEXT animation frame, so the neighbour's `mouseenter` often fires
// ~1 frame (~16ms) later than the leave — and a slower sweep across the small
// gap between cards adds more. A tiny window would drop those legitimate
// card→card moves. This value comfortably bridges the frame gap while still
// being short enough that a real pause on the background ends the browse.
const CHAIN_WINDOW_MS = 250;

// Shared across every hook instance (module-level) so the card you just LEFT can
// hand the browse off to the next one. Scoped by `group` so a browse only chains
// within a related set (e.g. one seat's hero row), never board-wide.
let leftZoomedAt = 0;
let leftZoomedGroup: string | undefined;

/**
 * JS-driven hover zoom for in-play board cards. Beyond a plain CSS `:hover`
 * it adds four behaviours the game wants:
 *
 *  - **Delayed activation**: a fresh hover only zooms after the cursor has sat
 *    on the card for `HOVER_DELAY_MS` — a quick pass-over doesn't trigger it.
 *  - **Instant chaining while browsing**: pass a `chainGroup` shared by a
 *    related set of cards (e.g. one seat's hero row). After you zoom a card and
 *    LEAVE it, landing on another card in that group within `CHAIN_WINDOW_MS`
 *    zooms it instantly — the delay filters incidental brushes, it shouldn't
 *    interrupt a deliberate sweep across the row. Cards with no `chainGroup`
 *    (or a different one) never chain, so this never leaks to other board cards.
 *  - **Sticky within 100% of the transformed card group**: once zoomed, it
 *    stays open while the cursor is anywhere over the main card or one of the
 *    supplied companion cards (an item or slain monster).
 *  - **Right-click cancels** the zoom and keeps it cancelled until the pointer
 *    leaves and re-enters this card.
 *
 * The element keeps its normal layout size; the caller applies
 * `transform: scale(zoom)` while `active` is true. Attach `ref` to the element
 * that scales and spread the returned handlers onto it.
 */
export function useHoverZoom<T extends HTMLElement>(
  chainGroup?: string,
  getCompanions?: () => Array<HTMLElement | null>,
) {
  const ref = useRef<T>(null);
  const [active, setActive] = useState(false);
  // Mirror of `active` we can read synchronously inside event handlers (state is
  // async): `deactivate` needs to know, right now, whether we were zoomed.
  const activeRef = useRef(false);
  // right-click suppression persists until the pointer leaves the card
  const suppressed = useRef(false);
  // pending "activate after HOVER_DELAY_MS" timer, if hovering but not yet zoomed
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => clearTimer, []);

  const activate = useCallback(() => {
    activeRef.current = true;
    setActive(true);
  }, []);

  // Drop the zoom. If we WERE zoomed, stamp the chain window from this instant
  // (synchronously, not via an effect) so the next card's `mouseenter` — which
  // may fire in the same tick — reads a fresh timestamp, not a stale one.
  const deactivate = useCallback(() => {
    if (activeRef.current && chainGroup !== undefined) {
      leftZoomedAt = Date.now();
      leftZoomedGroup = chainGroup;
    }
    activeRef.current = false;
    setActive(false);
  }, [chainGroup]);

  // Track the full transformed bounds of the main card plus attached elements.
  // The companions are transformed siblings, so the main card's mouseleave
  // event alone cannot represent the combined visible hover region.
  useEffect(() => {
    if (!active) return;
    const onMove = (e: MouseEvent) => {
      const elements = [ref.current, ...(getCompanions?.() ?? [])].filter(
        (el): el is HTMLElement => el !== null,
      );
      const insideAny = elements.some((el) => {
        // getBoundingClientRect includes the element's current transform.
        const r = el.getBoundingClientRect();
        return (
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom
        );
      });
      if (!insideAny) deactivate();
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, [active, deactivate, getCompanions]);

  const onMouseEnter = useCallback(() => {
    if (suppressed.current) return;
    clearTimer();
    // Always arm the fresh-hover delay timer, IN PARALLEL with the instant
    // chain below. It's needed as a fallback: when we chain-zoom instantly, the
    // cursor has just entered at the card's EDGE (coming off the neighbour), and
    // on the next mousemove the sticky watcher can measure the card before it has
    // scaled up — seeing the cursor outside its small rest-size box and dropping
    // the zoom. This timer then re-zooms the card once the cursor settles, so the
    // chained card doesn't flicker off. (If the chain zoom sticks, this fires a
    // harmless no-op at HOVER_DELAY_MS since we're already active.)
    timer.current = setTimeout(() => {
      timer.current = null;
      activate();
    }, HOVER_DELAY_MS);
    // Continuing a browse: we just left a zoomed card in this same group → zoom
    // now, without waiting out the delay above.
    if (
      chainGroup !== undefined &&
      chainGroup === leftZoomedGroup &&
      Date.now() - leftZoomedAt < CHAIN_WINDOW_MS
    ) {
      activate();
    }
  }, [chainGroup, activate]);

  const onMouseLeave = useCallback(() => {
    suppressed.current = false;
    clearTimer();
    // Once zoomed, the document tracker decides when the cursor has left the
    // whole card group. This keeps the zoom alive while entering a companion.
    if (!activeRef.current) deactivate();
  }, [deactivate]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    // right-click over the card: stop the zoom and arm suppression until we
    // leave and come back. Swallow the browser menu. Don't open the chain
    // window — a cancel isn't a browse.
    e.preventDefault();
    suppressed.current = true;
    clearTimer();
    activeRef.current = false;
    setActive(false);
  }, []);

  return { ref, active, onMouseEnter, onMouseLeave, onContextMenu };
}
