import React, { useState } from 'react';
import { LOBBY_ART, LobbyArt, artStyle } from './lobbyAssets';
import {
  FRAME,
  SEAT_BTN,
  SEAT_WIDGETS,
  SETTINGS_GRID,
  SETTINGS_WIDGET,
  START_WIDGET,
  Seat,
  boxStyle,
  fracStyle,
  px,
} from './lobbyLayout';
import { LobbyApi, LobbyPlayer, useLobbyState } from '../state/useLobbyState';

/* ---------------------------------------------------------------------------
 * LobbyView — pre-game lobby, composed EXACTLY like the board's layers
 * (bottom → top):
 *
 *   1. BACKGROUND — the empty decorated table (full-viewport `cover`,
 *      decorative only; owns no layout).
 *   2. STAGE — a centred, locked 16:9 box (container-type: size), the
 *      1672×941 art canvas as reference space (lobbyLayout.ts).
 *   3. ART OVERLAYS (z-10) — Side Bars + Center Frame PNGs, each stretched
 *      over the full stage: they share the background's canvas, so they
 *      self-align with it and with each other.
 *   4. WIDGETS (z-20/30) — the FLAT art pieces anchored on their painted
 *      slots: a Player Frame per seat (bar panels), the Settings board
 *      (centre of the Center Frame window), Start Game (the oval plaque),
 *      and the +/- medallions at the top of each player widget.
 *
 * All data flows through useLobbyState (demo now, `lobby:*` socket API
 * later — LobbyView never knows which).
 * ------------------------------------------------------------------------- */

const GOLD = '#e7c268';
const GOLD_DIM = '#b99a53';
const READY_GREEN = '#9fdc8a';
const PARCHMENT_INK = '#4a3418';

/** A div showing exactly the opaque region of a lobby PNG. */
function Art({
  art,
  className,
  style,
  ...rest
}: { art: LobbyArt } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={className} style={{ ...artStyle(art), ...style }} {...rest} />;
}

/* ----- one seat: Player Frame widget + live overlays + its +/- medallion -- */

function PlayerSlot({ seat, lobby }: { seat: Seat; lobby: LobbyApi }) {
  const player = lobby.players.find((p) => p.seat === seat) ?? null;
  const frame = LOBBY_ART.frameFlat;

  return (
    <div
      className="z-20"
      style={{ ...boxStyle(SEAT_WIDGETS[seat]), aspectRatio: `${frame.bw} / ${frame.bh}` }}
    >
      {/* the frame painting */}
      <Art art={frame} className="absolute inset-0" />

      {/* parchment name plate */}
      <NamePlate player={player} lobby={lobby} />

      {/* blue status strip — local non-host clicks it to toggle ready */}
      <div
        className="flex items-center justify-center"
        style={{
          ...fracStyle(FRAME.strip),
          cursor: player?.isLocal && !player.isHost ? 'pointer' : undefined,
        }}
        onClick={player?.isLocal && !player.isHost ? () => lobby.toggleReady(player.id) : undefined}
      >
        {player && (
          <span
            className="font-heading font-bold tracking-widest"
            style={{
              fontSize: px(8),
              color: player.isHost ? GOLD : player.ready ? READY_GREEN : GOLD_DIM,
              textShadow: `0 ${px(1)} ${px(3)} rgba(0,0,0,0.9)`,
            }}
          >
            {player.isHost ? 'HOST' : player.ready ? 'READY' : 'WAITING'}
          </span>
        )}
      </div>

      {/* avatar ring */}
      <div
        className="absolute flex items-center justify-center rounded-full"
        style={{
          left: `${FRAME.avatar.cx * 100}%`,
          top: `${FRAME.avatar.cy * 100}%`,
          width: `${FRAME.avatar.d * 100}%`,
          aspectRatio: '1',
          transform: 'translate(-50%, -50%)',
        }}
      >
        {player && (
          <span
            className="font-heading font-bold"
            style={{
              fontSize: px(24),
              color: GOLD,
              textShadow: `0 0 ${px(8)} rgba(80,150,255,0.6), 0 ${px(1.5)} ${px(4)} rgba(0,0,0,0.9)`,
            }}
          >
            {player.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* the seat's +/- medallion at the TOP of the widget — plus and minus
          SWAP IN PLACE at the shared SEAT_BTN spot: empty seat → plus (claim
          it), occupied seat → minus (a joined player removes himself; live
          mode will gate the click to that player's own client — the host
          never leaves). */}
      {player === null ? (
        <MedallionButton
          art={LOBBY_ART.addFlat}
          title="Add player"
          onClick={() => lobby.addPlayer(seat)}
        />
      ) : (
        !player.isHost && (
          <MedallionButton
            art={LOBBY_ART.removeFlat}
            title="Leave seat"
            onClick={() => lobby.removePlayer(player.id)}
          />
        )
      )}
    </div>
  );
}

function NamePlate({ player, lobby }: { player: LobbyPlayer | null; lobby: LobbyApi }) {
  const [editing, setEditing] = useState(false);
  const editable = player?.isLocal === true;

  return (
    <div
      className="z-30 flex items-center justify-center overflow-hidden"
      style={{ ...fracStyle(FRAME.plate), cursor: editable ? 'text' : undefined }}
      title={editable ? 'Click to rename' : undefined}
      onClick={editable && !editing ? () => setEditing(true) : undefined}
    >
      {editing && player ? (
        <input
          autoFocus
          defaultValue={player.name}
          maxLength={18}
          className="w-full bg-transparent text-center font-heading font-bold outline-none"
          style={{ fontSize: px(12), color: PARCHMENT_INK }}
          onBlur={(e) => {
            lobby.renamePlayer(player.id, e.currentTarget.value);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
          }}
        />
      ) : (
        <span
          className="truncate px-[6%] font-heading font-bold"
          style={{
            fontSize: px(12),
            color: player ? PARCHMENT_INK : 'rgba(74,52,24,0.45)',
            fontStyle: player ? undefined : 'italic',
          }}
        >
          {player ? player.name : 'Empty Seat'}
        </span>
      )}
    </div>
  );
}

function MedallionButton({
  art,
  title,
  onClick,
}: {
  art: LobbyArt;
  title: string;
  onClick: () => void;
}) {
  const { cx, cy, d } = SEAT_BTN;
  /* Positioning transform on the OUTER div, hover transform/filter classes on
   * the INNER art — combined on one element the inline style wins and the
   * hover effects go dead (same pitfall as the board's fan cards). */
  return (
    <div
      className="absolute z-30"
      style={{
        left: `${cx * 100}%`,
        top: `${cy * 100}%`,
        width: `${d * 100}%`,
        aspectRatio: `${art.bw} / ${art.bh}`,
        transform: 'translate(-50%, -50%)',
        filter: `drop-shadow(0 ${px(2)} ${px(6)} rgba(0,0,0,0.7))`,
      }}
    >
      <Art
        art={art}
        title={title}
        onClick={onClick}
        className="h-full w-full cursor-pointer transition-[transform,filter] duration-150 hover:scale-110 hover:brightness-125 active:scale-95"
      />
    </div>
  );
}

/* ----- settings board (flat art, centred in the Center Frame window) ------ */

function SettingsPanel({ lobby }: { lobby: LobbyApi }) {
  const g = SETTINGS_GRID;
  const rowH = g.h / g.rows;
  const art = LOBBY_ART.settingsFlat;

  return (
    <div
      className="z-20"
      style={{ ...boxStyle(SETTINGS_WIDGET), aspectRatio: `${art.bw} / ${art.bh}` }}
    >
      {/* the board painting — "Lobby Settings" title + 10-row ledger baked in */}
      <Art art={art} className="absolute inset-0" />

      {lobby.settings.slice(0, g.rows).map((s, i) => {
        const top = (g.y + rowH * i) * 100;
        const canCycle = s.options.length > 1;
        return (
          <React.Fragment key={s.key}>
            {/* label — left column (static) */}
            <div
              className="absolute flex items-center justify-center overflow-hidden"
              style={{
                left: `${g.x * 100}%`,
                top: `${top}%`,
                width: `${g.w * g.split * 100}%`,
                height: `${rowH * 100}%`,
              }}
            >
              <span
                className="truncate font-heading font-semibold"
                style={{ fontSize: px(11), color: GOLD_DIM, textShadow: `0 ${px(1)} ${px(3)} rgba(0,0,0,0.9)` }}
              >
                {s.label}
              </span>
            </div>
            {/* value — right column (layer 4, click to cycle) */}
            <div
              className={`absolute z-30 flex items-center justify-center overflow-hidden ${
                canCycle ? 'cursor-pointer transition-[filter] duration-150 hover:brightness-150' : ''
              }`}
              style={{
                left: `${(g.x + g.w * g.split) * 100}%`,
                top: `${top}%`,
                width: `${g.w * (1 - g.split) * 100}%`,
                height: `${rowH * 100}%`,
              }}
              title={canCycle ? 'Click to change' : undefined}
              onClick={canCycle ? () => lobby.cycleSetting(s.key) : undefined}
            >
              <span
                className="truncate font-heading font-bold"
                style={{ fontSize: px(11.5), color: GOLD, textShadow: `0 ${px(1)} ${px(3)} rgba(0,0,0,0.9)` }}
              >
                {s.value}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ----- the lobby ----------------------------------------------------------- */

export default function LobbyView({ onStart }: { onStart?: (playerCount: number) => void }) {
  const lobby = useLobbyState(onStart);
  const startArt = LOBBY_ART.startFlat;

  return (
    <div className="lobby-root fixed inset-0 select-none overflow-hidden bg-zinc-950 font-heading">
      {/* ---------- layer 1: full-viewport decorative table (no layout role) ---------- */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `url("${LOBBY_ART.backgroundEmpty.url}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* ---------- layer 2: locked 16:9 stage — the 1672×941 art canvas ---------- */}
      <div
        className="lobby-stage absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 [container-type:size]"
        style={{
          width: 'min(100vw, calc(100vh * 16 / 9))',
          height: 'min(100vh, calc(100vw * 9 / 16))',
        }}
      >
        {/* ---------- layer 3: art overlays, painted full-stage ----------
            Both PNGs share the background's 1672×941 canvas — stretching them
            over the stage aligns every painted panel with the Rects/Boxes in
            lobbyLayout.ts by construction. */}
        <img
          src={LOBBY_ART.sideBars.url}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute inset-0 z-10 h-full w-full object-fill"
        />
        <img
          src={LOBBY_ART.centerFrame.url}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute inset-0 z-10 h-full w-full object-fill"
        />

        {/* ---------- layer 4: the flat art widgets on their slots ---------- */}
        {([0, 1, 2, 3] as Seat[]).map((seat) => (
          <PlayerSlot key={seat} seat={seat} lobby={lobby} />
        ))}
        <SettingsPanel lobby={lobby} />

        {/* the bars' big middle panels are reserved (future player details) —
            lobbyLayout's MIDDLE_PANELS marks them; nothing renders there yet */}

        {/* START GAME — the flat button art on the oval plaque slot
            (position on the wrapper, hover fx on the art) */}
        <div
          className="z-30"
          style={{ ...boxStyle(START_WIDGET), aspectRatio: `${startArt.bw} / ${startArt.bh}` }}
        >
          <Art
            art={startArt}
            role="button"
            title={lobby.canStart ? 'Start the game' : 'Waiting for players…'}
            onClick={lobby.startGame}
            className={`h-full w-full transition-[transform,filter] duration-150 ${
              lobby.canStart
                ? 'cursor-pointer hover:scale-[1.04] hover:brightness-125 active:scale-95'
                : 'brightness-[0.55] saturate-[0.6]'
            }`}
          />
        </div>
      </div>
    </div>
  );
}
