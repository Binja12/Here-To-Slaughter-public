import React, { useRef, useState } from "react";
import {
  TABLE_BG,
  FRAMES,
  ASPECT,
  INSET,
  HUD,
  HUD_ASPECT,
  HUD_WIDGETS,
  HudDef,
  CENTER_H,
  CENTER_DX,
  CENTER_DY,
  CENTER_SLOTS,
  DECK_SLOTS,
  DeckDef,
  deckWidthCqh,
  PLAYERS,
  PlayerId,
  WidgetDef,
  Anchor,
  widthCqh,
  positionStyle,
} from "./layout";
import { useHoverZoom } from "./useHoverZoom";
import {
  heroCardUrl,
  heroClassOf,
  boardHeroCardUrl,
  boardMonsterUrl,
  boardLeaderUrl,
  boardItemUrl,
  boardMagicUrl,
  boardModifierUrl,
  boardChallengeUrl,
  LEADERS,
  SMALL_BACK,
  BIG_BACK,
} from "./assets";
import HeroRow, { Seat as HeroSeat } from "./HeroRow";
import PlayerHand from "./PlayerHand";
import DiceRoll, { DiceRollState } from "./DiceRoll";
import { PlayableFlags } from "./playable";
import {
  TargetingProvider,
  useTargeting,
  useTargetable,
  tkey,
  TargetKey,
} from "./targeting";

/**
 * The board is composed as four explicit layers (bottom → top):
 *
 *  1. BACKGROUND — a full-viewport felt (TABLE_BG, `background-size: cover`).
 *     Decorative only; owns no layout. On ultrawide/tall viewports the extra
 *     area is simply more felt (letterboxing), never extra board spacing.
 *  2. BOARD STAGE — a centred, locked 16:9 box that IS the 1920×1080 reference
 *     coordinate space. It scales uniformly with the viewport (min of the
 *     width/height fits) and declares `container-type: size`, so every cqh/cqw
 *     length inside resolves against the STAGE, not the viewport. Widgets
 *     therefore scale AND reposition together — the 16:9 composition is
 *     preserved at any resolution. The stage owns all board geometry.
 *  3. CENTRE WOODEN BOARD — the centre frame + CenterArena, placed in
 *     reference-space units inside the stage.
 *  4. PLAYER WIDGETS — hero rows, leader slots, hand-count slots and the hand,
 *     all positioned in stage-relative cqh/cqw (layout.ts). Cards are children
 *     of their widgets and inherit the stage scaling.
 */

/**
 * One placed frame widget: the frame art fills the box; `children` (the card
 * content) sit in the inner window, inset by the frame's border. Includes the
 * edge-aware hover lift so a hovered card floats above everything.
 */
function Widget({
  def,
  anchor,
  zClass = "z-20",
  children,
}: {
  def: WidgetDef;
  anchor: Anchor;
  zClass?: string;
  children?: React.ReactNode;
}) {
  const w = widthCqh(def);
  const ins = INSET[def.kind];
  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${zClass} has-[:hover]:z-[100]`}
      style={{
        height: `${def.h}cqh`,
        width: `${w}cqh`,
        ...positionStyle(anchor, def.dx, def.dy),
      }}
    >
      <img
        src={FRAMES[def.kind]}
        alt=""
        aria-hidden
        draggable={false}
        className="dimmable pointer-events-none absolute inset-0 h-full w-full object-fill"
      />
      {/* inner card window */}
      <div
        className="absolute"
        style={{
          left: `${((1 - ins.w) / 2) * 100}%`,
          top: `${((1 - ins.h) / 2) * 100}%`,
          width: `${ins.w * 100}%`,
          height: `${ins.h * 100}%`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** a single card scan centred in a slot, with optional hover zoom (managed by
 *  useHoverZoom: sticky within 60% of the scaled box, cancels on right-click). */
function SlotCard({
  src,
  alt,
  fit = 80,
  stretch = false,
  zoom,
  origin = "50% 50%",
  playable = false,
  targetKey,
  onActivate,
}: {
  src: string;
  alt: string;
  fit?: number;
  /**
   * When true the card FILLS its window on both axes (object-fill), so the
   * window's width and height (INSET.<kind>.w / .h) stretch it independently
   * — at the cost of distorting the card's aspect ratio. When false the card
   * keeps its aspect ratio and is letterboxed to `fit`% of the window.
   */
  stretch?: boolean;
  zoom?: number;
  /** CSS transform-origin ("x% y%") for the hover zoom — points toward centre */
  origin?: string;
  /** true → this card can be acted on now; shows the green playable aura */
  playable?: boolean;
  /** this slot's identity for targeting mode (dim / glow / pick) */
  targetKey?: TargetKey;
  /** clicked in normal mode (e.g. leader starting its steal action) */
  onActivate?: () => void;
}) {
  const hz = useHoverZoom<HTMLImageElement>();
  const t = useTargetable(targetKey, onActivate);
  // dimmed cards don't hover-zoom — they're background while aiming
  const zoomable = zoom !== undefined && !(t.targeting && t.mode === "dimmed");
  return (
    <div className="flex h-full w-full items-center justify-center">
      <img
        ref={zoomable ? hz.ref : undefined}
        src={src}
        alt={alt}
        draggable={false}
        className={`select-none rounded-[0.3cqw] shadow-[0.15cqw_0.3cqw_0.8cqw_rgba(0,0,0,0.7)] transition-transform duration-150 ${
          stretch ? "h-full w-full object-fill" : "object-contain"
        }${playable ? " card-aura card-aura-sm" : ""} ${t.className}`}
        style={{
          ...(stretch ? {} : { maxHeight: `${fit}%`, maxWidth: `${fit}%` }),
          transformOrigin: origin,
          transform: zoomable && hz.active ? `scale(${zoom})` : undefined,
        }}
        onClick={t.onClick}
        onMouseEnter={zoomable ? hz.onMouseEnter : undefined}
        onMouseLeave={zoomable ? hz.onMouseLeave : undefined}
        onContextMenu={zoomable ? hz.onContextMenu : undefined}
      />
    </div>
  );
}

/** discard pile: a few face-up cards offset for depth, newest (zoomable) on top.
 *  Targetable as ONE unit — the container dims/glows, covering every card. */
function DiscardPile({
  cards,
  targetKey,
}: {
  cards: string[];
  targetKey?: TargetKey;
}) {
  const hz = useHoverZoom<HTMLImageElement>();
  const t = useTargetable(targetKey);
  return (
    <div className={`relative h-full w-full ${t.className}`} onClick={t.onClick}>
      {cards.map((src, i) => {
        const top = i === cards.length - 1;
        return (
          <div
            key={`${src}-${i}`}
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translate(${(i - 1) * 0.18}cqw, ${(1 - i) * 0.18}cqw) rotate(${
                (i - 1) * 2
              }deg)`,
              zIndex: i,
            }}
          >
            <img
              ref={top ? hz.ref : undefined}
              src={src}
              alt={top ? "discard" : ""}
              aria-hidden={!top}
              draggable={false}
              className="max-h-full max-w-full select-none rounded-[0.3cqw] object-contain shadow-[0.1cqw_0.2cqw_0.5cqw_rgba(0,0,0,0.6)] transition-transform duration-150"
              style={
                top
                  ? {
                      transformOrigin: "50% 50%",
                      transform: hz.active ? "scale(3)" : undefined,
                    }
                  : undefined
              }
              onMouseEnter={top ? hz.onMouseEnter : undefined}
              onMouseLeave={top ? hz.onMouseLeave : undefined}
              onContextMenu={top ? hz.onContextMenu : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}

/** face-down deck: a few offset backs stacked for depth. `playable` puts the
 *  green aura on the TOP back only (drawing is available). */
function DeckPile({
  back = SMALL_BACK,
  playable = false,
  targetKey,
  onActivate,
}: {
  back?: string;
  playable?: boolean;
  /** the pile's identity for targeting mode — the whole stack dims/glows */
  targetKey?: TargetKey;
  /** clicked in normal mode (e.g. drawing from the main deck) */
  onActivate?: () => void;
}) {
  const t = useTargetable(targetKey, onActivate);
  return (
    <div className={`relative h-full w-full ${t.className}`} onClick={t.onClick}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `translate(${(i - 1) * 0.15}cqw, ${(1 - i) * 0.15}cqw)`,
          }}
        >
          <img
            src={back}
            alt="deck"
            draggable={false}
            className={`max-h-full max-w-full select-none rounded-[0.3cqw] object-contain shadow-[0.1cqw_0.2cqw_0.5cqw_rgba(0,0,0,0.6)]${
              playable && i === 2 ? " card-aura" : ""
            }`}
          />
        </div>
      ))}
    </div>
  );
}

/** hand-count widget: small card back with the count above its logo.
 *  `playable` = at least one card in the hand behind this stack is playable
 *  right now, so the closed stack itself glows as the cue to open the fan. */
function HandCount({
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

/** A HUD widget (turn banner / action bar): placed in stage cqh by a HudDef
 *  (anchor + dx/dy), height in cqh, width from its art aspect. Same position
 *  knobs as the player widgets. */
function HudWidget({
  def,
  aspect,
  zClass = "z-40",
  children,
}: {
  def: HudDef;
  aspect: number;
  zClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${zClass}`}
      style={{
        height: `${def.h}cqh`,
        width: `${def.h * aspect}cqh`,
        ...positionStyle(def.anchor, def.dx, def.dy),
      }}
    >
      {children}
    </div>
  );
}

/** action-points bar: the Action Pointer Border frame with a row of gems, one
 *  lit per available action point. */
function ActionPoints({ current, max = 3 }: { current: number; max?: number }) {
  return (
    <div className="relative h-full w-full">
      <img
        src={HUD.actionFrame}
        alt=""
        aria-hidden
        draggable={false}
        className="dimmable pointer-events-none absolute inset-0 h-full w-full object-fill"
      />
      {/* gems sit in the frame's inner recess */}
      <div className="absolute inset-x-[10%] inset-y-[22%] flex items-center justify-center gap-[0.5cqw]">
        {Array.from({ length: max }, (_, i) => (
          <img
            key={i}
            src={HUD.actionGem}
            alt={i < current ? "action point" : "spent action point"}
            draggable={false}
            className="dimmable aspect-square h-full select-none object-contain transition-opacity"
            style={{ opacity: i < current ? 1 : 0.25 }}
          />
        ))}
      </div>
    </div>
  );
}

/* Demo data until wired to live game state. */
const h = (slug: string) => ({ slug, heroClass: heroClassOf(slug) });
/** hero WITH an attached item card (demo). */
const hItem = (slug: string, item: string) => ({ ...h(slug), item });
const DEMO = {
  p1: {
    heroes: [
      hItem("fuzzy-cheeks", "Really Big Ring"),
      h("bad-axe"),
      h("wildshot"),
      hItem("meowzio", "Thief Mask"),
      h("wiggles"),
      h("wise-shield"),
      h("lucky-bucky"),
      h("quick-draw"),
      h("snowball"),
      hItem("kit-napper", "Suspiciously Shiny Coin"),
    ],
    leader: LEADERS.Thief,
    handCards: [
      boardHeroCardUrl("lucky-bucky") ?? heroCardUrl("lucky-bucky"),
      boardItemUrl("Really Big Ring"),
      boardMagicUrl("Critical Boost"),
      boardModifierUrl("+4"),
      boardChallengeUrl(),
      boardHeroCardUrl("fuzzy-cheeks") ?? heroCardUrl("fuzzy-cheeks"),
      boardItemUrl("Suspiciously Shiny Coin"),
      boardMagicUrl("Forceful Winds"),
    ],
    actionPoints: 2,
    /* demo playable flags — later computed from the live server snapshot on
       every game:state update and passed down exactly like this. */
    playable: {
      monsters: [true, false, true],
      mainDeck: true,
      leader: true,
      heroes: [true, false, false, true, false, false, false, true, false, false],
      hand: [true, false, true, true, false, true, false, false],
    } as PlayableFlags,
  },
  p2: {
    heroes: [
      "heavy-bear",
      "sharp-fox",
      "calming-voice",
      "shurikitty",
      "bun-bun",
    ].map(h),
    leader: LEADERS.Fighter,
    hand: 3,
  },
  p3: {
    heroes: [
      "napping-nibbles",
      "pan-chucks",
      "lookie-rookie",
      "sly-pickings",
      "buttons",
    ].map(h),
    leader: LEADERS.Thief,
    hand: 7,
  },
  p4: {
    heroes: [
      "tough-teddy",
      "wily-red",
      "silent-shadow",
      "fluffy",
      "qi-bear",
    ].map(h),
    leader: LEADERS.Guardian,
    hand: 2,
  },
};

const HERO_SEAT: Record<string, HeroSeat> = {
  p1: "bottom",
  p2: "top",
  p3: "left",
  p4: "right",
};

/**
 * Demo action table until the server drives this: clicking a SOURCE card
 * begins targeting over its valid TARGETS (targeting.tsx). Later the live
 * snapshot supplies {source → targets} per playable card and `onPick` sends
 * the real `game:action`; adding an interaction (challenge, attack, hero
 * steal…) is just another entry — no component changes.
 *
 * Current demos:
 *  - The Shadow Claw (p1's thief leader) steals a card — targets are the
 *    other players' hand stacks.
 *  - Fuzzy Cheeks (p1's hero 0): "draw a card, then play a hero from your
 *    hand" — the pick-a-hero step: targets are ONLY the hero cards in the
 *    hand (the fan force-opens because the targets live in it).
 *  - Critical Boost (hand card 2, a magic): a hand card as the SOURCE —
 *    targets are p1's own heroes on the board.
 */
const DEMO_ACTIONS: Record<TargetKey, { name: string; targets: TargetKey[] }> =
  {
    [tkey.leader("p1")]: {
      name: "steal a card",
      targets: [
        tkey.handStack("p2"),
        tkey.handStack("p3"),
        tkey.handStack("p4"),
      ],
    },
    [tkey.hero("p1", 0)]: {
      name: "play a hero from your hand",
      // only the HERO cards in the hand qualify (their art lives under a
      // heroes/ folder — stand-in for the server's real target list)
      targets: DEMO.p1.handCards.flatMap((url, i) =>
        url.includes("/heroes/") ? [tkey.handCard(i)] : []
      ),
    },
    [tkey.handCard(2)]: {
      name: "boost one of your heroes",
      targets: DEMO.p1.heroes.map((_, i) => tkey.hero("p1", i)),
    },
  };

export default function Board() {
  return (
    <TargetingProvider>
      <BoardInner />
    </TargetingProvider>
  );
}

function BoardInner() {
  const { active, begin, cancel } = useTargeting();

  /** the 2d6 throw (DiceRoll) — a new state replays the animation from the
   *  given seat's side of the table; the settled dice then STAY on the felt
   *  until the next throw. Once the board is wired to useGameState the values
   *  come from the server's roll game:event instead of the demo, and the
   *  turn-end event clears the table via setDiceRoll(null). */
  const [diceRoll, setDiceRoll] = useState<DiceRollState | null>(null);
  const rollSeq = useRef(0);
  const showDiceRoll = (seat: PlayerId) => {
    const d6 = () => 1 + Math.floor(Math.random() * 6);
    setDiceRoll({ seat, values: [d6(), d6()], nonce: ++rollSeq.current });
  };

  /** clicked a glowing (playable) card in normal mode. If its action needs a
   *  target, enter targeting mode to pick one; otherwise it's a direct play
   *  and resolves immediately. Every glowing card is pressable — cards with no
   *  entry in DEMO_ACTIONS are treated as a plain "play this card". */
  const activate = (source: TargetKey) => {
    const action = DEMO_ACTIONS[source];
    if (action && action.targets.length > 0) {
      begin({
        source,
        targets: action.targets,
        onPick: (target) => {
          // TODO: send the real action to the server here (useGameState)
          console.log(`[action] ${action.name}: ${source} → ${target}`);
        },
      });
      return;
    }
    // no target step → play it directly (TODO: send game:action)
    console.log(`[action] play: ${source}${action ? ` (${action.name})` : ""}`);
    // DEMO: a pressed hero is a RollOnHero — the server answers the action
    // with the roll result; simulate that round-trip (latency + 2d6) until
    // the board is wired to useGameState.
    if (source.startsWith("hero:")) {
      const seat = source.split(":")[1] as PlayerId;
      window.setTimeout(() => showDiceRoll(seat), 350);
    }
  };

  return (
    <div
      className={`board-root relative h-screen w-screen overflow-hidden bg-zinc-950${
        active ? " targeting" : ""
      }`}
      // any click that no target/source swallowed backs out of targeting
      onClick={active ? cancel : undefined}
    >
      {/* ---------- layer 1: full-viewport decorative felt (no layout role) ---------- */}
      <div
        className="dimmable pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `url("${TABLE_BG}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* ---------- layer 2: centred, locked 16:9 board stage ----------
          Its width/height are always a 16:9 box scaled to fit the viewport
          (min of the two fits), and `container-type: size` makes all cqh/cqw
          inside resolve against THIS stage — so the whole composition scales
          uniformly and never stretches on ultrawide/other aspect ratios. */}
      <div
        className="board-stage absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 [container-type:size]"
        style={{
          width: "min(100vw, calc(100vh * 16 / 9))",
          height: "min(100vh, calc(100vw * 9 / 16))",
        }}
      >
        {/* ---------- layer 3: centre wooden board ---------- */}
        <div
          className="absolute z-20 -translate-x-1/2 -translate-y-1/2 has-[:hover]:z-[100]"
          style={{
            left: `calc(50% + ${CENTER_DX}cqh)`,
            top: `calc(50% + ${CENTER_DY}cqh)`,
            height: `${CENTER_H}cqh`,
            width: `${CENTER_H * ASPECT.center}cqh`,
          }}
        >
          <img
            src={FRAMES.center}
            alt=""
            aria-hidden
            draggable={false}
            className="dimmable pointer-events-none absolute inset-0 h-full w-full object-fill"
          />
          <CenterArena playable={DEMO.p1.playable} onActivate={activate} />
        </div>

        {/* ---------- layer 4: per-player frames + cards ---------- */}
        {(["p1", "p2", "p3", "p4"] as const).map((seat) => {
          const p = PLAYERS[seat];
          const d = DEMO[seat];
          return (
            <React.Fragment key={seat}>
              <Widget def={p.heroes} anchor={p.anchor}>
                <HeroRow
                  heroes={d.heroes}
                  seat={HERO_SEAT[seat]}
                  // only the local (active) seat ever glows
                  playable={
                    seat === "p1" ? DEMO.p1.playable.heroes : undefined
                  }
                  targetKeyFor={(i) => tkey.hero(seat, i)}
                  // EVERY hero press throws that seat's dice (user spec):
                  // p1 goes through activate() (targeting demos still win);
                  // opponents throw directly so all 4 directions demo.
                  onActivateFor={
                    seat === "p1"
                      ? (i) => activate(tkey.hero(seat, i))
                      : () => showDiceRoll(seat)
                  }
                />
              </Widget>
              <Widget def={p.leader} anchor={p.anchor}>
                <SlotCard
                  src={boardLeaderUrl(d.leader)}
                  alt="party leader"
                  stretch
                  zoom={2.1}
                  playable={seat === "p1" && DEMO.p1.playable.leader}
                  targetKey={tkey.leader(seat)}
                  onActivate={
                    seat === "p1" && DEMO.p1.playable.leader
                      ? () => activate(tkey.leader(seat))
                      : undefined
                  }
                  // left/right leaders zoom from their own centre. top/bottom
                  // leaders always grow from their edge's horizontal centre
                  // (NOT dx-biased) — this was the original, correct behaviour.
                  origin={
                    p.anchor === "left" || p.anchor === "right"
                      ? "50% 50%"
                      : p.anchor === "bottom"
                        ? "50% 100%"
                        : "50% 0%"
                  }
                />
              </Widget>
              <Widget def={p.cardback} anchor={p.anchor} zClass="z-40">
                {seat === "p1" ? (
                  <PlayerHand
                    cards={DEMO.p1.handCards}
                    anchorCenterCqw={82}
                    playable={DEMO.p1.playable.hand}
                    onActivateCard={(i) => activate(tkey.handCard(i))}
                  >
                    <HandCount
                      count={DEMO.p1.handCards.length}
                      playable={DEMO.p1.playable.hand.some(Boolean)}
                      targetKey={tkey.handStack(seat)}
                    />
                  </PlayerHand>
                ) : (
                  <HandCount
                    count={(d as { hand: number }).hand}
                    targetKey={tkey.handStack(seat)}
                  />
                )}
              </Widget>
            </React.Fragment>
          );
        })}

        {/* ---------- HUD: turn banner + action points (top-right) ---------- */}
        <HudWidget def={HUD_WIDGETS.yourTurn} aspect={HUD_ASPECT.yourTurn}>
          <img
            src={HUD.yourTurn}
            alt="your turn"
            draggable={false}
            className="dimmable pointer-events-none h-full w-full select-none object-fill"
          />
        </HudWidget>
        <HudWidget
          def={HUD_WIDGETS.actionPoints}
          aspect={HUD_ASPECT.actionFrame}
        >
          <ActionPoints current={DEMO.p1.actionPoints} max={3} />
        </HudWidget>

        {/* ---------- dice roll (appears on the felt left of the centre board) ---------- */}
        <DiceRoll roll={diceRoll} />
      </div>
    </div>
  );
}

/** A deck pile / discard slot: same anchor+dx/dy+h placement mechanic as
 *  <Widget> (via `positionStyle`), but with NO frame image — width comes from
 *  the def's own `aspect` (deckWidthCqh) instead of a FrameKind lookup. */
function DeckSlot({
  def,
  anchor,
  children,
}: {
  def: DeckDef;
  anchor: Anchor;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 z-30 has-[:hover]:z-[100]"
      style={{
        height: `${def.h}cqh`,
        width: `${deckWidthCqh(def)}cqh`,
        ...positionStyle(anchor, def.dx, def.dy),
      }}
    >
      {children}
    </div>
  );
}

/** The 3 flipped monsters — frame WIDGETs placed inside the centre wooden board
 *  via a `center`-anchored <Widget>, so they inherit the SAME knobs as the
 *  player widgets: position (dx/dy in CENTER_SLOTS), scale (h), inner window
 *  (INSET[kind]) and content stretch. Because they're children of the centre
 *  box, they stay attached to it — moving/scaling the centre (CENTER_DX/DY/
 *  CENTER_H) carries them along. Deck piles (DECK_SLOTS) use the SAME dx/dy/h
 *  mechanic via <DeckSlot>, just with no frame. */
const MONSTER_NAMES = ["Mega Slime", "Titan Wyvern", "Abyss Queen"] as const;

/** demo discard pile: face-up cards, last one is the top (newest) card. */
const DISCARD = [
  boardModifierUrl("-4"),
  boardItemUrl("Decoy Doll"),
  boardMagicUrl("Destructive Spell"),
];

function CenterArena({
  playable,
  onActivate,
}: {
  playable: PlayableFlags;
  /** press a glowing centre card (attackable monster / drawable deck) */
  onActivate: (key: TargetKey) => void;
}) {
  const { monsters } = CENTER_SLOTS;
  const { mainDeck, discard, monsterDeck } = DECK_SLOTS;
  return (
    <>
      {monsters.map((def, i) => (
        <Widget key={`monster-${i}`} def={def} anchor="center" zClass="z-30">
          <SlotCard
            src={boardMonsterUrl(MONSTER_NAMES[i])}
            alt="monster"
            stretch
            zoom={3}
            origin="50% 50%"
            playable={playable.monsters[i]}
            targetKey={tkey.monster(i)}
            onActivate={
              playable.monsters[i]
                ? () => onActivate(tkey.monster(i))
                : undefined
            }
          />
        </Widget>
      ))}

      <DeckSlot def={mainDeck} anchor="center">
        <DeckPile
          back={SMALL_BACK}
          playable={playable.mainDeck}
          targetKey={tkey.mainDeck()}
          onActivate={
            playable.mainDeck ? () => onActivate(tkey.mainDeck()) : undefined
          }
        />
      </DeckSlot>
      <DeckSlot def={discard} anchor="center">
        <DiscardPile cards={DISCARD} targetKey={tkey.discard()} />
      </DeckSlot>
      <DeckSlot def={monsterDeck} anchor="center">
        <DeckPile back={BIG_BACK} targetKey={tkey.monsterDeck()} />
      </DeckSlot>
    </>
  );
}
