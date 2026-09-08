import AssetImage from '../loading/AssetImage'
import CardReactionTimer from './CardReactionTimer';
import { useOptionalGameView } from '../state/game';
import React, { useEffect, useState } from "react";
import { CHALLENGE_LAYOUT, HUD, HUD_ASPECT, PlayerId } from "./layout";
import { nameOf, slotsFor } from "./seats";
import type { PlayerView } from "../contract";
import { NONHERO_CARD_ASPECT } from "./assets";
import { DicePair, DICE_SETTLE_MS } from "./DiceRoll";
import { tkey, useTargetable } from "./targeting";
import {
  ChallengeRole,
  ChallengeRoll,
  ChallengeSide,
  ChallengeState,
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
 *    settled total in the board's "your turn" scroll art, and everything
 *    modifying that roll — cards played onto it, a leader's, a monster's or
 *    a hero's standing bonus — fanned at its outer edge, each with its amount.
 *    (Every seat's hand size stays readable on the BOARD: the cardback
 *    widgets are dim-exempted while a challenge is open — Board.tsx.)
 *
 * MODIFIER TARGETING: each panel registers itself as a targetable board
 * element (tkey.challengeRoll(role)) — pressing a modifier card in the hand
 * begins a normal targeting request whose targets are these panels, so
 * picking which roll to modify is one click on the panel (gold pick glow).
 */



/**
 * What to call one side of the challenge, worded for the viewer.
 *
 * The player ID first and the screen seat only as a fallback: a seat is a
 * PLACE, and an unresolved one used to default to the viewer's, which named
 * both sides "YOU" (the owner, 2026-09-08).
 */
const sideName = (view: PlayerView | null, side: ChallengeSide): string => {
  if (view && side.playerId) return nameOf(view, side.playerId)
  if (!view) return side.seat === 'p1' ? 'YOU' : 'PLAYER'
  return nameOf(view, slotsFor(view)[side.seat] ?? undefined)
}

export default function ChallengeWindow({
  hidden = false,
  onHide,
}: {
  /** put away by the player to look at the table (Board's Challenge button brings it back) */
  hidden?: boolean;
  onHide?: () => void;
}) {
  const { active } = useChallenge();
  const view = useOptionalGameView();
  const cardId = view?.pendingWindows.find((window) => window.type === 'Challenge')?.cardId;
  if (!active || hidden) return null;

  // Only the side that is WINNING glows, so the window says at a glance who
  // is ahead (the owner, 2026-09-08). Level, or either side still rolling,
  // and neither glows — there is no lead to report.
  // Whichever side is MINE takes the left panel. Read from the player id
  // when the server has said who is who, and from the screen seat otherwise.
  const challengerIsMine = active.challenger.playerId
    ? !!view && active.challenger.playerId === view.playerId
    : active.challenger.seat === "p1";

  const ahead = rollTotal(active.challenged.roll);
  const behind = rollTotal(active.challenger.roll);
  const lead =
    ahead === null || behind === null || ahead === behind
      ? null
      : ahead > behind
        ? "challenged"
        : "challenger";

  return (
    <div className="dim-exempt pointer-events-none absolute inset-0 z-[140]">
      {/* click shield: the game is paused — every board click dies here.
          (The hand widget is raised above this z by Board, so playing
          modifiers from the open fan still works.) A click on the shield
          itself puts the window away. */}
      <div
        className="pointer-events-auto absolute inset-0"
        onClick={(e) => {
          e.stopPropagation();
          onHide?.();
        }}
      />

      <CenterStage active={active} cardId={cardId} />

      {/* Nothing else until somebody has actually challenged: before that the
          window is the PLAY, on its own, so a card tucked behind its hero can
          be seen and contested (the owner, 2026-09-07). The viewer is always
          seated at p1 (seats.ts), so this is the whole of "am I the one who
          challenged". Whichever side is MINE takes the left panel; with
          neither side mine the roles keep their own order. The green/red stays
          with the ROLE — it says who is defending, which the position does
          not. */}
      {active.started && (
        <>
          <RollPanel
            role="challenged"
            side={active.challenged}
            left={!challengerIsMine}
            name={sideName(view, active.challenged)}
            leading={lead === "challenged"}
          />
          <RollPanel
            role="challenger"
            side={active.challenger}
            left={challengerIsMine}
            name={sideName(view, active.challenger)}
            leading={lead === "challenger"}
          />
        </>
      )}

    </div>
  );
}

/** centre stage: challenged card in front, challenge card tucked behind at
 *  an angle with `peek` of its width showing. Neither takes a pick — a
 *  modifier is aimed at a roll PANEL, and having the cards answer to the same
 *  keys made aiming feel undefined (the owner, 2026-09-08). They are what the
 *  challenge is ABOUT; the panels are where it is decided. */
function CenterStage({ active, cardId }: { active: ChallengeState; cardId?: string }) {
  const L = CHALLENGE_LAYOUT;
  return (
    <div
      className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
      style={{
        height: `${L.card.h}cqh`,
        width: `${L.card.h * active.challengedCardAspect}cqh`,
        left: `calc(50% + ${L.card.dx}cqh)`,
        top: `calc(50% + ${L.card.dy}cqh)`,
      }}
    >
      <div className="challenge-pop relative h-full w-full">
        {/* the hero an item is going onto, tucked the OTHER way from the
            challenge card so both can be read at once */}
        {active.carrierCardUrl && (
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              height: `${L.tuck.scale * 100}%`,
              aspectRatio: String(active.carrierCardAspect ?? NONHERO_CARD_ASPECT),
              transformOrigin: "50% 80%",
              transform: `translate(-50%, -50%) translateX(${
                -L.tuck.peek * 100
              }%) rotate(${-L.tuck.angle}deg)`,
            }}
          >
            <AssetImage
              src={active.carrierCardUrl}
              alt="hero the item is played onto"
              draggable={false}
              className="h-full w-full select-none rounded-[0.5cqw] object-fill shadow-[0.3cqw_0.5cqw_1.4cqw_rgba(0,0,0,0.8)]"
            />
          </div>
        )}
        {active.started && <div
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
          <AssetImage
            src={active.challengeCardUrl}
            alt="challenge card"
            draggable={false}
            className="h-full w-full select-none rounded-[0.5cqw] object-fill shadow-[0.3cqw_0.5cqw_1.4cqw_rgba(0,0,0,0.8)]"
          />
        </div>}
        <AssetImage
          src={active.challengedCardUrl}
          alt="challenged card"
          draggable={false}
          className="absolute inset-0 h-full w-full select-none rounded-[0.5cqw] object-fill shadow-[0.3cqw_0.6cqw_1.8cqw_rgba(0,0,0,0.85)]"
        />
        <CardReactionTimer cardId={cardId} />
      </div>
    </div>
  );
}

/** A side's roll as the table reads it: both dice plus everything played
 *  onto it. Null while that side has not rolled. */
const rollTotal = (roll: ChallengeRoll | null) =>
  roll ? roll.values[0] + roll.values[1] + (roll.modifier ?? 0) : null;

/** one side's roll panel: role title + seat, that player's 2d6 (the shared
 *  DicePair widget), the settled total in the "your turn" scroll, and its
 *  played modifier cards. The VIEWER's side sits left when they are in the
 *  challenge at all, otherwise the challenged does; `mirror` flips the
 *  modifier fan's offsets toward that side's edge of the screen. The aura
 *  colour follows the ROLE — green defends, red contests — not the side, and
 *  only the side that is AHEAD wears one. */
function RollPanel({
  role,
  side,
  left,
  name,
  leading,
}: {
  role: ChallengeRole;
  side: ChallengeSide;
  /** which half of the stage this panel takes — the caller decides */
  left: boolean;
  /** whose roll this is, already worded for the viewer ("YOU") */
  name: string;
  /** this side's total is the higher one — the only side that glows */
  leading: boolean;
}) {
  const L = CHALLENGE_LAYOUT;
  const defending = role === "challenged";
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
          : !leading
            ? "border-stone-400/25"
            : defending
              ? "challenge-glow-green border-green-300/60"
              : "challenge-glow-red border-red-300/60"
      }`}
      // the side this panel is, for anything reading the board rather than
      // looking at it — the words on it are the player's name now
      data-role={role}
      style={{
        height: `${L.panel.h}cqh`,
        width: `${L.panel.w}cqh`,
        left: `calc(50% + ${mirror * L.panel.dx}cqh)`,
        top: `calc(50% + ${L.panel.dy}cqh)`,
      }}
      onClick={t.onClick}
    >
      <div className="challenge-pop relative h-full w-full">
{/* The seat, not the role: "challenged" and "challenger" are engine words,
            and the table already knows which side is which from the colour
            (the owner, 2026-09-08). Green defends, red contests. */}
        <div
          className={`absolute inset-x-0 top-[8%] truncate px-[0.5cqw] text-center font-heading text-[1.9cqw] uppercase leading-tight drop-shadow-[0_0.1cqw_0.2cqw_rgba(0,0,0,0.9)] ${
            defending ? "text-green-300" : "text-red-300"
          }`}
        >
          {name}
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
          <div className="absolute inset-x-0 top-[55%] text-center font-body text-[1.5cqw] italic text-amber-100/60">
            rolling…
          </div>
        )}

        <RollScroll roll={side.roll} tone={leading ? (defending ? "green" : "red") : null} />

        {/* everything modifying THIS roll, fanned at the outer edge */}
        {side.roll?.modifierCards.map(({ url, amount }, i) => (
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
            <AssetImage
              src={url}
              alt={`roll bonus ${amount > 0 ? '+' : ''}${amount}`}
              draggable={false}
              className="h-full w-full select-none rounded-[0.4cqw] object-fill shadow-[0.2cqw_0.4cqw_1cqw_rgba(0,0,0,0.75)]"
            />
            <span className="absolute left-1/2 top-full mt-[0.4cqh] -translate-x-1/2 whitespace-nowrap font-heading text-[1.35cqw] text-amber-100 drop-shadow-[0_0.1cqw_0.2cqw_rgba(0,0,0,0.9)]">
              {amount > 0 ? '+' : '−'}{Math.abs(amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** the roll readout in the board's "your turn" scroll art, revealed only
 *  once the dice have finished tumbling — the TOTAL as it stands, dice plus
 *  every modifier (the owner, 2026-09-05: the cards are on the table for
 *  anyone who wants the arithmetic). Modifier updates re-render the label
 *  in place — the nonce is unchanged so the dice stay settled. */
function RollScroll({
  roll,
  tone,
}: {
  roll: ChallengeRoll | null;
  /** the winning side's colour, or null while this side is not ahead */
  tone: "green" | "red" | null;
}) {
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
  const label = `${rollTotal(roll)}`;
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
      <AssetImage
        src={HUD.yourTurn}
        alt=""
        aria-hidden
        draggable={false}
        className={`pointer-events-none absolute inset-0 h-full w-full select-none object-fill${
          tone === "green" ? " card-aura" : tone === "red" ? " enemy-aura" : ""
        }`}
      />
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap leading-none text-[#f5b03e] drop-shadow-[0_0.08cqw_0.15cqw_rgba(0,0,0,0.9)]"
        style={{
          fontFamily: "'Alfa Slab One', serif",
          fontSize: `${L.scroll.h * 0.42}cqh`,
        }}
      >
        {label}
      </span>
    </div>
  );
}
