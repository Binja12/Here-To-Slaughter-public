import React from 'react';

/**
 * Action points widget, laid over the background's brass socket bar. The bar
 * has NINE painted hexagonal sockets; a lamp lights in each while a point is
 * available (no numeral, so any AP total reads naturally). Dots are absolutely
 * placed on the measured socket centres (~11%..89%, even) and sized to sit
 * inside the hexagons. If AP exceeds 9, a "+N" chip appears past the bar.
 */

const SOCKETS = 9;
// even socket centres across the painted bar (measured from board-bg.png)
const SOCKET_X = Array.from(
  { length: SOCKETS },
  (_, i) => 11 + (i * (89 - 11)) / (SOCKETS - 1),
);

export default function ActionPointsBar({ current = 3 }: { current?: number }) {
  const overflow = Math.max(0, current - SOCKETS);
  return (
    <div className="relative h-full w-full">
      {SOCKET_X.map((x, i) => (
        <span
          key={i}
          className={`absolute top-1/2 aspect-square h-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all ${
            i < current
              ? 'bg-amber-400 shadow-[0_0_0.8cqw_0.15cqw_rgba(251,191,36,0.85)]'
              : 'bg-black/50 shadow-inner'
          }`}
          style={{ left: `${x}%` }}
        />
      ))}
      {overflow > 0 && (
        <span className="absolute right-[-2.5cqw] top-1/2 -translate-y-1/2 rounded-full border border-amber-500/70 bg-zinc-900 px-[0.5cqw] font-heading text-[0.9cqw] font-bold text-amber-200">
          +{overflow}
        </span>
      )}
    </div>
  );
}
