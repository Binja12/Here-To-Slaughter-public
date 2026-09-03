import React from 'react';

/**
 * GameCard — the fundamental card blueprint (modular rebuild, phase 2).
 *
 * Anatomy (top → bottom):
 *   1. Header: framed title banner
 *   2. Main artwork window: bordered inset
 *   3. Footer: rule/ability text block
 *   4. Overlapping badge: circular, straddles the bottom-center edge
 *      (class icon for heroes, attack number for monsters, …)
 *
 * Size is controlled by the caller via `className` (width/height); the
 * internals scale with the frame. Parent containers must NOT clip overflow,
 * or the badge gets cut off.
 */

export interface GameCardProps {
  title: string;
  /** Content of the artwork window (an <img>, or omit for a placeholder). */
  art?: React.ReactNode;
  /** Rule / ability / requirement text shown in the footer block. */
  ruleText?: React.ReactNode;
  /** Content of the circular badge (icon or number). Omit to hide it. */
  badge?: React.ReactNode;
  /** Sizing + positioning from the caller, e.g. "w-24" or "h-full". */
  className?: string;
}

export default function GameCard({
  title,
  art,
  ruleText,
  badge,
  className = '',
}: GameCardProps) {
  return (
    <div
      className={`relative flex aspect-[5/7] flex-col rounded-lg border border-amber-600/40 bg-gradient-to-b from-zinc-700 via-zinc-800 to-zinc-950 p-[4%] shadow-lg shadow-black/60 ${className}`}
    >
      {/* Header: framed title banner */}
      <div className="rounded-sm border border-amber-700/40 bg-black/50 px-1 py-[2%] text-center text-[0.6rem] font-semibold uppercase tracking-wide text-amber-100 leading-tight truncate">
        {title}
      </div>

      {/* Main artwork window */}
      <div className="mt-[4%] min-h-0 flex-[3] overflow-hidden rounded-sm border border-amber-700/30 bg-gradient-to-br from-zinc-600/60 to-zinc-900">
        {art}
      </div>

      {/* Footer: rule / ability text */}
      <div className="mt-[4%] min-h-0 flex-[2] overflow-hidden rounded-sm border border-amber-700/20 bg-black/40 px-1 py-[2%] text-center text-[0.5rem] leading-snug text-zinc-300">
        {ruleText}
      </div>

      {/* Overlapping badge: straddles the bottom-center edge */}
      {badge !== undefined && (
        <div className="absolute bottom-0 left-1/2 z-10 flex h-[22%] max-h-9 min-h-6 -translate-x-1/2 translate-y-1/2 transform items-center justify-center rounded-full border-2 border-amber-600/70 bg-gradient-to-b from-zinc-600 to-zinc-900 text-xs font-bold text-amber-100 shadow-md shadow-black/70 aspect-square">
          {badge}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badge icons (class glyphs)                                          */
/* ------------------------------------------------------------------ */

export function SwordIcon({ className = 'h-[60%] w-[60%]' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M6.9 17.1 3 21l-1.5-1.5 3.9-3.9-1-1 1.4-1.4 1 1L17.6 3.4 21 3l-.4 3.4L9.3 17.1l1 1L8.9 19.5l-1-1z" />
    </svg>
  );
}

export function ShieldIcon({ className = 'h-[60%] w-[60%]' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Example implementations                                             */
/* ------------------------------------------------------------------ */

/** Small party card: class icon badge. */
export function HeroCardExample({ className = 'w-20' }) {
  return (
    <GameCard
      className={className}
      title="Bad Axe"
      ruleText="Roll 8+: DESTROY an Item card equipped to a Hero."
      badge={<SwordIcon />}
    />
  );
}

/** Larger arena card: attack-requirement number badge. */
export function MonsterCardExample({ className = 'w-28' }) {
  return (
    <GameCard
      className={className}
      title="Titan Wyvern"
      ruleText="On slay: +1 Action Point each turn. Fight back: sacrifice a Hero."
      badge={<span>8+</span>}
    />
  );
}
