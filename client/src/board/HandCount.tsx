import React from "react";
import { SMALL_BACK } from "./assets";
import { useTargetable, TargetKey } from "./targeting";

/** hand-count widget: small card back with the count above its logo.
 *  Used in each seat's cardback frame AND beside the challenge window's roll
 *  panels (an opponent's remaining cards — modifier fuel). `playable` = at
 *  least one card in the hand behind this stack is playable right now, so
 *  the closed stack itself glows as the cue to open the fan. */
export default function HandCount({
  count,
  playable = false,
  targetKey,
}: {
  count: number;
  playable?: boolean;
  /** the stack's identity for targeting mode (e.g. steal-a-card target) */
  targetKey?: TargetKey;
}) {
  const t = useTargetable(targetKey);
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        className={`relative h-full w-full shadow-[0.15cqw_0.3cqw_0.8cqw_rgba(0,0,0,0.7)]${
          playable ? " card-aura card-aura-sm" : ""
        } ${t.className}`}
        onClick={t.onClick}
      >
        <img
          src={SMALL_BACK}
          alt="card back"
          draggable={false}
          className="absolute inset-0 h-full w-full select-none rounded-[0.4cqw] object-fill"
        />
        <span
          className="absolute left-1/2 top-[30%] -translate-x-1/2 -translate-y-1/2 text-[1.15cqw] leading-none text-[#5a4a33] drop-shadow-[0_0.05cqw_0.05cqw_rgba(255,240,200,0.6)]"
          style={{ fontFamily: "'Alfa Slab One', serif" }}
        >
          {count}
        </span>
      </div>
    </div>
  );
}
