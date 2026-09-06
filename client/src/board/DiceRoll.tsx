import { useEffect, useRef, useState } from "react";
import { assetUrl } from "../assetUrl";
import {
  DICE_SIZE,
  DICE_SPOTS,
  DiceSpotDef,
  PlayerId,
  positionStyle,
} from "./layout";

/**
 * DiceRoll — TWO 3D tumbling d6s thrown from the roller's seat onto that
 * seat's patch of felt beside the centre board (DICE_SPOTS in layout.ts).
 *
 * Each die is a CSS cube: the six face PNGs (/board/Dice/dice_face_N.png) are
 * rotated+pushed out (translateZ) inside a `preserve-3d` box, laid out like a
 * REAL die (opposite faces sum to 7): 1↔6 front/back, 2↔5 right/left,
 * 3↔4 top/bottom — so the adjacencies seen mid-tumble are physically right.
 *
 * One throw = per die (the second starts STAGGER_MS later), four layered
 * Web-Animations (WAAPI; a re-throw remounts the dice via key={nonce}):
 *  - FLIGHT wrapper — slides in from the thrower's direction
 *    (fromDx/fromDy cqh), decelerating like a die losing momentum;
 *  - TOSS wrapper — drops in from above, lands, small hop, settles;
 *  - CUBE — 2-3 full tumbles on X AND Y (random count for variety),
 *    decelerating into the exact orientation that faces the rolled value at
 *    the viewer (SHOW map);
 *  - SHADOW — sits at the landing spot (outside the flight), fades in on
 *    impact, dips during the hop.
 * The settled dice STAY on the table until the next throw replaces them or
 * the roll is cleared (roll=null — e.g. when the turn ends).
 */

/** one thrown 2d6 pair — the reusable payload (board roll, challenge roll…) */
export interface DiceThrow {
  /** the two rolled faces (1-6) — later straight from the server's roll event */
  values: [number, number];
  /** bump per roll so the same values rolled twice still replay */
  nonce: number;
}

export interface DiceRollState extends DiceThrow {
  /** who threw — picks the landing spot + throw direction (DICE_SPOTS) */
  seat: PlayerId;
}

/** throw geometry of a pair, relative to the landing spot's centre
 *  (fromDx/fromDy = where the dice come from; ±pairDx/pairDy = each die's
 *  landing offset) — the placement (dx/dy) stays with the caller. */
export type DiceThrowSpot = Pick<
  DiceSpotDef,
  "fromDx" | "fromDy" | "pairDx" | "pairDy"
>;


const faceUrl = (n: number) => assetUrl(`/board/Dice/dice_face_${n}.png`);

/** where each face PNG sits on the cube (real-die layout, opposites sum 7) */
const FACE_PLACEMENT: { value: number; rotate: string }[] = [
  { value: 1, rotate: "rotateY(0deg)" }, // front
  { value: 6, rotate: "rotateY(180deg)" }, // back
  { value: 2, rotate: "rotateY(90deg)" }, // right
  { value: 5, rotate: "rotateY(-90deg)" }, // left
  { value: 3, rotate: "rotateX(90deg)" }, // top
  { value: 4, rotate: "rotateX(-90deg)" }, // bottom
];

/** cube rotation (deg) that brings each face around to the front */
const SHOW: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
  5: { x: 0, y: 90 },
  6: { x: 0, y: -180 },
};

const ROLL_MS = 1500; // flight + tumble of one die
const STAGGER_MS = 120; // the second die leaves the hand a beat later

/** when (ms after mount) both dice of a pair have visibly settled — callers
 *  use it to reveal results (e.g. the challenge panels' totals) in sync */
export const DICE_SETTLE_MS = ROLL_MS + STAGGER_MS;

/**
 * TWO thrown dice rendered around the parent's LOCAL ORIGIN (a 0×0 point):
 * die A lands at −(pairDx,pairDy), die B at +. The caller owns the placement
 * of that point — the board-level <DiceRoll> puts it on the felt via
 * DICE_SPOTS, the challenge window puts one inside each roll panel.
 */
export function DicePair({
  dice,
  spot,
  size = DICE_SIZE,
}: {
  dice: DiceThrow;
  spot: DiceThrowSpot;
  size?: number;
}) {
  return (
    <>
      {dice.values.map((value, i) => (
        <Die
          // remount per throw so each Die's animations start fresh
          key={`${dice.nonce}-${i}`}
          value={value}
          offX={(i === 0 ? -1 : 1) * spot.pairDx}
          offY={(i === 0 ? -1 : 1) * spot.pairDy}
          fromX={spot.fromDx}
          fromY={spot.fromDy}
          delay={i * STAGGER_MS}
          size={size}
        />
      ))}
    </>
  );
}

export default function DiceRoll({
  roll,
  outcome = "none",
}: {
  roll: DiceRollState | null;
  /** what the roll means as it stands (liveRoll.rollOutcome): once the dice
   *  have settled each die wears a square glow — green over the threshold,
   *  red under it, none in a monster's "nothing happens" band. A box-shadow
   *  square BEHIND the die, not a filter: a filter on an ancestor flattens
   *  the 3D cubes. */
  outcome?: "success" | "failure" | "none";
}) {
  // the glow waits for the throw to land (per throw = per nonce)
  const [settled, setSettled] = useState(false);
  const nonce = roll?.nonce;
  useEffect(() => {
    setSettled(false);
    if (nonce === undefined) return;
    const timer = window.setTimeout(() => setSettled(true), DICE_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [nonce]);

  // fully controlled: the dice sit on the table for as long as `roll` is set —
  // the next throw (new nonce) remounts them, roll=null clears the table
  if (!roll) return null;

  const spot = DICE_SPOTS[roll.seat];
  return (
    // a 0×0 point at the landing spot's centre — each die offsets from it
    <div
      className="pointer-events-none absolute z-[95]"
      style={positionStyle("center", spot.dx, spot.dy)}
    >
      {outcome !== "none" &&
        settled &&
        [0, 1].map((i) => (
          <div
            key={i}
            className={`${outcome === "success" ? "dice-glow-green" : "dice-glow"} absolute -translate-x-1/2 -translate-y-1/2`}
            style={{
              left: `${(i === 0 ? -1 : 1) * spot.pairDx}cqh`,
              top: `${(i === 0 ? -1 : 1) * spot.pairDy}cqh`,
              width: `${DICE_SIZE}cqh`,
              height: `${DICE_SIZE}cqh`,
            }}
          />
        ))}
      <DicePair dice={roll} spot={spot} />
    </div>
  );
}

function Die({
  value,
  offX,
  offY,
  fromX,
  fromY,
  delay,
  size = DICE_SIZE,
}: {
  value: number;
  /** this die's landing centre, cqh from the spot centre (±pairDx/pairDy) */
  offX: number;
  offY: number;
  /** throw start, cqh relative to the landing spot (toward the thrower) */
  fromX: number;
  fromY: number;
  delay: number;
  /** die edge length in cqh — DICE_SIZE on the felt, smaller in panels */
  size?: number;
}) {
  const flightRef = useRef<HTMLDivElement>(null);
  const tossRef = useRef<HTMLDivElement>(null);
  const cubeRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);

  // runs once per mount — the parent remounts us (key=nonce) for every throw
  useEffect(() => {
    const flight = flightRef.current;
    const toss = tossRef.current;
    const cube = cubeRef.current;
    const shadow = shadowRef.current;
    if (!flight || !toss || !cube || !shadow) return;

    const anims: Animation[] = [];
    // `both`: keyframe 0 also holds DURING the stagger delay (die hidden at
    // its start position), final keyframe persists after.
    const opts = (easing?: string): KeyframeAnimationOptions => ({
      duration: ROLL_MS,
      delay,
      easing,
      fill: "both",
    });

    // 2-3 full tumbles per axis; the NEGATIVE final angles keep both axes
    // spinning the same way the whole flight, easing into the shown face.
    const fx = SHOW[value].x - 360 * (2 + Math.floor(Math.random() * 2));
    const fy = SHOW[value].y - 360 * (3 + Math.floor(Math.random() * 2));
    anims.push(
      cube.animate(
        [
          { transform: "rotateX(0deg) rotateY(0deg)" },
          { transform: `rotateX(${fx}deg) rotateY(${fy}deg)` },
        ],
        opts("cubic-bezier(0.2, 0.75, 0.25, 1)"),
      ),
    );

    // slide in from the thrower's side, decelerating to rest at the spot
    anims.push(
      flight.animate(
        [
          { transform: `translate(${fromX}cqh, ${fromY}cqh)` },
          { transform: "translate(0cqh, 0cqh)" },
        ],
        opts("cubic-bezier(0.12, 0.65, 0.3, 1)"),
      ),
    );

    // drop in from above (accelerating), land at 45%, hop, settle
    anims.push(
      toss.animate(
        [
          {
            transform: "translateY(-170%) scale(0.6)",
            opacity: 0,
            offset: 0,
            easing: "cubic-bezier(0.45, 0, 0.8, 0.5)",
          },
          { opacity: 1, offset: 0.12 },
          {
            transform: "translateY(0%) scale(1.04)",
            offset: 0.45,
            easing: "cubic-bezier(0.2, 0.8, 0.4, 1)",
          },
          {
            transform: "translateY(-14%) scale(1.02)",
            offset: 0.68,
            easing: "cubic-bezier(0.5, 0, 0.8, 0.6)",
          },
          { transform: "translateY(0%) scale(1)", opacity: 1, offset: 1 },
        ],
        opts(),
      ),
    );

    // contact shadow appears on impact, lightens while the die hops
    anims.push(
      shadow.animate(
        [
          { opacity: 0, transform: "translateX(-50%) scale(0.5)", offset: 0 },
          { opacity: 0, transform: "translateX(-50%) scale(0.5)", offset: 0.3 },
          {
            opacity: 0.55,
            transform: "translateX(-50%) scale(1)",
            offset: 0.45,
          },
          {
            opacity: 0.3,
            transform: "translateX(-50%) scale(0.85)",
            offset: 0.68,
          },
          { opacity: 0.5, transform: "translateX(-50%) scale(1)", offset: 1 },
        ],
        opts(),
      ),
    );

    return () => anims.forEach((a) => a.cancel());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{
        left: `${offX}cqh`,
        top: `${offY}cqh`,
        height: `${size}cqh`,
        width: `${size}cqh`,
      }}
    >
      {/* landing shadow — OUTSIDE flight + toss so neither motion moves it */}
      <div
        ref={shadowRef}
        className="absolute left-1/2 top-[86%] h-[20%] w-full rounded-[50%] bg-black opacity-0"
        style={{ filter: "blur(0.35cqw)" }}
      />
      {/* flight wrapper: the cross-table throw from the roller's seat */}
      <div ref={flightRef} className="absolute inset-0">
        {/* toss wrapper: drop-in + landing bounce; also owns the 3D perspective */}
        <div
          ref={tossRef}
          className="absolute inset-0 opacity-0"
          style={{ perspective: `${size * 3.5}cqh` }}
        >
          <div
            ref={cubeRef}
            className="absolute inset-0"
            style={{ transformStyle: "preserve-3d" }}
          >
            {FACE_PLACEMENT.map((f) => (
              <div
                key={f.value}
                className="absolute inset-0"
                style={{
                  transform: `${f.rotate} translateZ(${size / 2}cqh)`,
                  backfaceVisibility: "hidden",
                }}
              >
                <img
                  src={faceUrl(f.value)}
                  alt={`die face ${f.value}`}
                  draggable={false}
                  className="dimmable h-full w-full select-none object-fill"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
