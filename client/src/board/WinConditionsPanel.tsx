import React from 'react';

/**
 * Win-condition checklist, laid over the background's 7-row ledger panel.
 * Each painted row has a diamond socket on the LEFT (~11%) and a circular
 * socket on the RIGHT (~90%); the objective label sits in the recessed bar
 * between them, the progress count sits IN the right circle. The grid is
 * inset to 8%..92% vertically so its 7 rows land on the 7 painted rows
 * (centres measured from board-bg.png).
 */

export interface WinCondition {
  label: string;
  done: boolean;
  progress: string;
}

const DIAMOND_X = 11; // painted left diamond socket centre (%)
const CIRCLE_X = 90; // painted right circle socket centre (%)

export default function WinConditionsPanel({
  conditions,
}: {
  conditions: WinCondition[];
}) {
  const rows = Array.from(
    { length: 7 },
    (_, i): WinCondition | undefined => conditions[i],
  );
  return (
    <div className="absolute inset-x-0 bottom-[8%] top-[8%] grid grid-rows-[repeat(7,1fr)]">
      {rows.map((c, i) => (
        <div key={i} className="relative">
          {c && (
            <>
              {/* diamond socket highlight (left) when the objective is met */}
              {c.done && (
                <span
                  className="absolute top-1/2 h-[0.7cqw] w-[0.7cqw] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-amber-400 shadow-[0_0_0.6cqw_rgba(251,191,36,0.9)]"
                  style={{ left: `${DIAMOND_X}%` }}
                />
              )}
              {/* objective label — sits between the two sockets */}
              <span
                className={`absolute top-1/2 -translate-y-1/2 truncate font-heading text-[0.6cqw] font-semibold uppercase leading-none ${
                  c.done ? 'text-amber-200' : 'text-zinc-400'
                }`}
                style={{ left: '18%', right: '20%' }}
                title={c.label}
              >
                {c.label}
              </span>
              {/* progress count centred in the right circle socket */}
              <span
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 font-heading text-[0.72cqw] font-bold leading-none text-amber-100"
                style={{ left: `${CIRCLE_X}%` }}
              >
                {c.progress}
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
