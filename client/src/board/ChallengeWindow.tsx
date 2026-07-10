import React, { useEffect, useState } from "react";
import { CHALLENGE_LAYOUT, HUD, HUD_ASPECT } from "./layout";
import { NONHERO_CARD_ASPECT } from "./assets";
import { DicePair, DICE_SETTLE_MS } from "./DiceRoll";
import { tkey, useTargetable } from "./targeting";
import {
  ChallengeRole,
  ChallengeRoll,
  ChallengeSide,
  useChallenge,
} from "./challenge";

/**
 * ChallengeWindow — the paused-game overlay while a challenge resolves.
 * Pure presentation of the ChallengeState in challenge.tsx; every length
 * comes from CHALLENGE_LAYOUT (layout.ts) so the whole window is tuned the
 * same way as the board widgets.
 *
 * Layers (all inside the 16:9 stage, so cqh/cqw resolve as usual):
 *  - the board below is dimmed by CSS (`.challenge-open` on the board root,
 *    same treatment as targeting mode); this overlay marks itself
 *    `dim-exempt`, so its whole SUBTREE stays bright;
 *  - a full-stage click shield swallows board clicks (the game is paused) —
 *    the local hand sits ABOVE it (Board raises its z) and stays playable;
 *  - centre: the CHALLENGED card, with the challenge card tucked behind it
 *    at an angle, ~30% peeking out (the item-behind-hero pattern);
 *  - one roll panel per side — challenged LEFT (green aura), challenger
 *    RIGHT (red aura) — each showing that player's 2d6 with the SAME dice
 *    widget as the board (DicePair) thrown in from its outer edge, the
 *    settled total in the board's "your turn" scroll art, and every
 *    modifier card played onto that roll fanned at its outer edge.
 *    (Every seat's hand size stays readable on the BOARD: the cardback
 *    widgets are dim-exempted while a challenge is open — Board.tsx.)
 *
 * MODIFIER TARGETING: each panel registers itself as a targetable board
 * element (tkey.challengeRoll(role)) — pressing a modifier card in the hand
 * begins a normal targeting request whose targets are these panels, so
 * picking which roll to modify is one click on the panel (gold pick glow).
 */

const seatLabel = (seat: string) =>
  seat === "p1" ? "you" : `player ${seat.slice(1)}`;

export default function ChallengeWindow() {
  const { active } = useChallenge();
  if (!active) return null;

  const L = CHALLENGE_LAYOUT;
  return (
    <div className="dim-exempt pointer-events-none absolute inset-0 z-[140]">
      {/* click shield: the game is paused — every board click dies here.
          (The hand widget is raised above this z by Board, so playing
          modifiers from the open fan still works.) */}
      <div
        className="pointer-events-auto absolute inset-0"
        onClick={(e) => e.stopPropagation()}
      />

      {/* centre stage: challenged card in front, challenge card tucked
          behind at an angle with `peek` of its width showing */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{
          height: `${L.card.h}cqh`,
          width: `${L.card.h * active.challengedCardAspect}cqh`,
          left: `calc(50% + ${L.card.dx}cqh)`,
          top: `calc(50% + ${L.card.dy}cqh)`,
        }}
      >
        <div className="challenge-pop relative h-full w-full">
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              height: `${L.tuck.scale * 100}%`,
              aspectRatio: String(NONHERO_CARD_ASPECT),
              transformOrigin: "50% 80%",
              transform: `translate(-50%, -50%) translateX(${
                L.tuck.peek * 100
              }%) rotate(${L.tuck.angle}deg)`,
            }}
          >
            <img
              src={active.challengeCardUrl}
              alt="challenge card"
              draggable={false}
              className="h-full w-full select-none rounded-[0.5cqw] object-fill shadow-[0.3cqw_0.5cqw_1.4cqw_rgba(0,0,0,0.8)]"
            />
          </div>
          <img
            src={active.challengedCardUrl}
            alt="challenged card"
            draggable={false}
            className="absolute inset-0 h-full w-full select-none rounded-[0.5cqw] object-fill shadow-[0.3cqw_0.6cqw_1.8cqw_rgba(0,0,0,0.85)]"
          />
        </div>
      </div>

      <RollPanel role="challenged" side={active.challenged} />
      <RollPanel role="challenger" side={active.challenger} />
    </div>
  );
}

/** one side's roll panel: role title + seat, that player's 2d6 (the shared
 *  DicePair widget), the settled total in the "your turn" scroll, and its
 *  played modifier cards. Challenged sits LEFT with the green aura,
 *  challenger RIGHT with the red one; `mirror` flips the modifier fan's
 *  offsets toward that side's edge of the screen. */
function RollPanel({ role, side }: { role: ChallengeRole; side: ChallengeSide }) {
  const L = CHALLENGE_LAYOUT;
  const left = role === "challenged";
  const mirror = left ? -1 : 1;
  const spot = L.dice.spots[role];
  // the panel is a targetable element (modifier picks) — but its glow stays
  // box-shadow-based (t.className's filter auras would flatten the 3D dice),
  // so we consume only the MODE + onClick and style the glow ourselves.
  const t = useTargetable(tkey.challengeRoll(role));
  const pickable = t.mode === "target";
  return (
    <div
      className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-[1cqw] border-[0.18cqw] bg-black/60 ${
        pickable
          ? "challenge-glow-pick cursor-pointer border-amber-200/80"
          : left
            ? "challenge-glow-green border-green-300/60"
            : "challenge-glow-red border-red-300/60"
      }`}
      style={{
        height: `${L.panel.h}cqh`,
        width: `${L.panel.w}cqh`,
        left: `calc(50% + ${mirror * L.panel.dx}cqh)`,
        top: `calc(50% + ${L.panel.dy}cqh)`,
      }}
      onClick={t.onClick}
    >
      <div className="challenge-pop relative h-full w-full">
        <div
          className={`absolute inset-x-0 top-[6%] text-center font-heading text-[0.95cqw] uppercase tracking-[0.18cqw] ${
            left ? "text-green-300" : "text-red-300"
          }`}
        >
          {role}
        </div>
        <div className="absolute inset-x-0 top-[19%] text-center font-heading text-[1.25cqw] text-amber-100">
          {seatLabel(side.seat)}
        </div>

        {side.roll ? (
          // a 0×0 point the pair lands around, offset from the panel centre
          <div
            className="absolute"
            style={{
              left: `calc(50% + ${spot.dx}cqh)`,
              top: `calc(50% + ${spot.dy}cqh)`,
            }}
          >
            <DicePair dice={side.roll} spot={spot} size={L.dice.size} />
          </div>
        ) : (
          <div className="absolute inset-x-0 top-[55%] text-center font-body text-[1.1cqw] italic text-amber-100/50">
            rolling…
          </div>
        )}

        <RollScroll roll={side.roll} />

        {/* every modifier played onto THIS roll, fanned at the outer edge */}
        {side.roll?.modifierCards.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className="absolute"
            style={{
              height: `${L.modCard.h}cqh`,
              width: `${L.modCard.h * NONHERO_CARD_ASPECT}cqh`,
              left: `calc(50% + ${mirror * (L.modCard.dx + i * L.modCard.step)}cqh)`,
              top: `calc(50% + ${L.modCard.dy}cqh)`,
              transform: `translate(-50%, -50%) rotate(${mirror * L.modCard.angle}deg)`,
              zIndex: i,
            }}
          >
            <img
              src={url}
              alt="modifier card"
              draggable={false}
              className="h-full w-full select-none rounded-[0.4cqw] object-fill shadow-[0.2cqw_0.4cqw_1cqw_rgba(0,0,0,0.75)]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** the roll readout in the board's "your turn" scroll art, revealed only
 *  once the dice have finished tumbling — just the score, with the signed
 *  "± {mod}" suffix ONLY when a modifier has been played (exactly like a
 *  roll on the board's turn banner). Modifier updates re-render the label
 *  in place — the nonce is unchanged so the dice stay settled. */
function RollScroll({ roll }: { roll: ChallengeRoll | null }) {
  const [shown, setShown] = useState(false);
  const nonce = roll?.nonce;
  useEffect(() => {
    setShown(false);
    if (nonce === undefined) return;
    const t = window.setTimeout(() => setShown(true), DICE_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [nonce]);

  if (!roll || !shown) return null;
  const L = CHALLENGE_LAYOUT;
  const sum = roll.values[0] + roll.values[1];
  const label =
    roll.modifier !== null
      ? `${sum} ${roll.modifier < 0 ? "-" : "+"} ${Math.abs(roll.modifier)}`
      : `${sum}`;
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{
        height: `${L.scroll.h}cqh`,
        width: `${L.scroll.h * HUD_ASPECT.yourTurn}cqh`,
        left: `calc(50% + ${L.scroll.dx}cqh)`,
        top: `calc(50% + ${L.scroll.dy}cqh)`,
      }}
    >
      <img
        src={HUD.yourTurn}
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
      />
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap leading-none text-[#f5b03e] drop-shadow-[0_0.08cqw_0.15cqw_rgba(0,0,0,0.9)]"
        style={{
          fontFamily: "'Alfa Slab One', serif",
          // matches the TurnBanner's 0.95cqw at its 6cqh scroll height
          fontSize: `${L.scroll.h * 0.28}cqh`,
        }}
      >
        {label}
      </span>
    </div>
  );
}
