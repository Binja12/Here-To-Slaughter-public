import React from 'react';
import {
  TABLE_BG,
  FRAMES,
  ASPECT,
  INSET,
  CENTER_H,
  PLAYERS,
  WidgetDef,
  Anchor,
  widthCqh,
  positionStyle,
} from './layout';
import {
  heroCardUrl,
  heroClassOf,
  boardMonsterUrl,
  boardLeaderUrl,
  LEADERS,
  SMALL_BACK,
  BIG_BACK,
} from './assets';
import HeroRow, { Seat as HeroSeat } from './HeroRow';
import PlayerHand from './PlayerHand';

/**
 * The board: a felt Table Background fills the viewport; frame WIDGETS are
 * placed over it (layout.ts) sized in cqh (height-relative) and anchored to
 * screen edges so they REPOSITION — not rescale — when the window resizes.
 * Cards sit in each frame's inner window. `container-type: size` powers cqh/cqw.
 */

/**
 * One placed frame widget: the frame art fills the box; `children` (the card
 * content) sit in the inner window, inset by the frame's border. Includes the
 * edge-aware hover lift so a hovered card floats above everything.
 */
function Widget({
  def,
  anchor,
  zClass = 'z-20',
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
        className="pointer-events-none absolute inset-0 h-full w-full object-fill"
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

/** a single card scan centred in a slot, with optional edge-aware hover zoom */
function SlotCard({
  src,
  alt,
  fit = 100,
  zoom,
  origin = 'origin-center',
}: {
  src: string;
  alt: string;
  fit?: number;
  zoom?: number;
  origin?: string;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={`select-none rounded-[0.3cqw] object-contain shadow-[0.15cqw_0.3cqw_0.8cqw_rgba(0,0,0,0.7)] ${origin} transition-transform duration-150`}
        style={{ maxHeight: `${fit}%`, maxWidth: `${fit}%` }}
        onMouseEnter={
          zoom
            ? (e) => {
                e.currentTarget.style.transform = `scale(${zoom})`;
              }
            : undefined
        }
        onMouseLeave={
          zoom
            ? (e) => {
                e.currentTarget.style.transform = '';
              }
            : undefined
        }
      />
    </div>
  );
}

/** face-down deck: a few offset backs stacked for depth */
function DeckPile({ back = SMALL_BACK }: { back?: string }) {
  return (
    <div className="relative h-full w-full">
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
            className="max-h-full max-w-full select-none rounded-[0.3cqw] object-contain shadow-[0.1cqw_0.2cqw_0.5cqw_rgba(0,0,0,0.6)]"
          />
        </div>
      ))}
    </div>
  );
}

/** hand-count widget: small card back with the count above its logo */
function HandCount({ count }: { count: number }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        className="relative w-full shadow-[0.15cqw_0.3cqw_0.8cqw_rgba(0,0,0,0.7)]"
        style={{ aspectRatio: '1060 / 1484' }}
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

/* Demo data until wired to live game state. */
const h = (slug: string) => ({ slug, heroClass: heroClassOf(slug) });
const DEMO = {
  p1: {
    heroes: [
      'fuzzy-cheeks',
      'bad-axe',
      'wildshot',
      'meowzio',
      'wiggles',
      'wise-shield',
      'lucky-bucky',
      'quick-draw',
      'snowball',
      'kit-napper',
    ].map(h),
    leader: LEADERS.Ranger,
    handCards: [
      heroCardUrl('lucky-bucky'),
      '/cards/item.png',
      '/cards/magic.png',
      '/cards/modifier.png',
      '/cards/challenge.png',
      heroCardUrl('fuzzy-cheeks'),
      heroCardUrl('bullseye'),
      heroCardUrl('spooky'),
    ],
  },
  p2: {
    heroes: ['heavy-bear', 'sharp-fox', 'calming-voice', 'shurikitty', 'bun-bun'].map(h),
    leader: LEADERS.Fighter,
    hand: 3,
  },
  p3: {
    heroes: ['napping-nibbles', 'pan-chucks', 'lookie-rookie', 'sly-pickings', 'buttons'].map(h),
    leader: LEADERS.Thief,
    hand: 7,
  },
  p4: {
    heroes: ['tough-teddy', 'wily-red', 'silent-shadow', 'fluffy', 'qi-bear'].map(h),
    leader: LEADERS.Guardian,
    hand: 2,
  },
};

const HERO_SEAT: Record<string, HeroSeat> = {
  p1: 'bottom',
  p2: 'top',
  p3: 'left',
  p4: 'right',
};
const LEADER_ORIGIN: Record<string, string> = {
  p1: 'origin-bottom',
  p2: 'origin-top',
  p3: 'origin-bottom-left',
  p4: 'origin-bottom-right',
};

export default function Board() {
  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-zinc-950 [container-type:size]"
      style={{
        backgroundImage: `url("${TABLE_BG}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* ---------- centre arena ---------- */}
      <div
        className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 has-[:hover]:z-[100]"
        style={{ height: `${CENTER_H}cqh`, width: `${CENTER_H * ASPECT.center}cqh` }}
      >
        <img
          src={FRAMES.center}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-fill"
        />
        <CenterArena />
      </div>

      {/* ---------- per-player frames + cards ---------- */}
      {(['p1', 'p2', 'p3', 'p4'] as const).map((seat) => {
        const p = PLAYERS[seat];
        const d = DEMO[seat];
        return (
          <React.Fragment key={seat}>
            <Widget def={p.heroes} anchor={p.anchor}>
              <HeroRow heroes={d.heroes} seat={HERO_SEAT[seat]} />
            </Widget>
            <Widget def={p.leader} anchor={p.anchor}>
              <SlotCard
                src={boardLeaderUrl(d.leader)}
                alt="party leader"
                zoom={2.3}
                origin={LEADER_ORIGIN[seat]}
              />
            </Widget>
            <Widget def={p.cardback} anchor={p.anchor} zClass="z-40">
              {seat === 'p1' ? (
                <PlayerHand cards={DEMO.p1.handCards} anchorCenterCqw={82}>
                  <HandCount count={DEMO.p1.handCards.length} />
                </PlayerHand>
              ) : (
                <HandCount count={(d as { hand: number }).hand} />
              )}
            </Widget>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** monsters (upper band) + decks/dice (lower band) inside the centre frame */
function CenterArena() {
  const insetPct = INSET.center;
  return (
    <div
      className="absolute"
      style={{
        left: `${((1 - insetPct.w) / 2) * 100}%`,
        top: `${((1 - insetPct.h) / 2) * 100}%`,
        width: `${insetPct.w * 100}%`,
        height: `${insetPct.h * 100}%`,
      }}
    >
      <div className="flex h-full w-full flex-col">
        {/* monsters */}
        <div className="flex flex-[3] items-center justify-center gap-[0.6cqw]">
          {['Mega Slime', 'Titan Wyvern', 'Abyss Queen'].map((m) => (
            <div key={m} className="flex h-full flex-1 items-center justify-center">
              <SlotCard
                src={boardMonsterUrl(m)}
                alt="monster"
                zoom={3.2}
                origin="origin-center"
              />
            </div>
          ))}
        </div>
        {/* decks / discard / monster deck */}
        <div className="flex flex-[2] items-center justify-center gap-[1cqw]">
          <div className="flex h-full flex-1 items-center justify-center">
            <DeckPile back={SMALL_BACK} />
          </div>
          <div className="flex h-full flex-1 items-center justify-center">
            <SlotCard src="/cards/magic.png" alt="discard" fit={90} />
          </div>
          <div className="flex h-full flex-1 items-center justify-center">
            <DeckPile back={BIG_BACK} />
          </div>
        </div>
      </div>
    </div>
  );
}
