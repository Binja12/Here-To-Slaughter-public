import React from 'react'
import type { LobbyPlayer } from '../contract'
import type { LobbyApi } from '../state/useLobbyState'
import { LOBBY_ART, type LobbyArt, artStyle } from './lobbyAssets'
import {
  FRAME,
  LAYERS,
  SEAT_BTN,
  SEAT_WIDGETS,
  SETTINGS_GRID,
  SETTINGS_WIDGET,
  START_WIDGET,
  type Seat,
  boxStyle,
  fracStyle,
  px,
} from './lobbyLayout'

const GOLD = '#e7c268'
const GOLD_DIM = '#b99a53'
const READY_GREEN = '#9fdc8a'
const PARCHMENT_INK = '#4a3418'

type Occupant = LobbyPlayer & {
  isHost: boolean
  isLocal: boolean
  ready: boolean
}

function Art({
  art,
  className,
  style,
  ...rest
}: { art: LobbyArt } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={className} style={{ ...artStyle(art), ...style }} {...rest} />
}

/** The +/− medallion art filling an avatar ring. */
function MedallionButton({
  art,
  title,
  onClick,
}: {
  art: LobbyArt
  title: string
  onClick: () => void
}) {
  // placed on the FRAME (not inside the ring box) so its size is a fraction
  // of the frame width, like every other measurement of the frame art
  return (
    <div
      className="absolute z-30"
      style={{
        left: `${SEAT_BTN.cx * 100}%`,
        top: `${SEAT_BTN.cy * 100}%`,
        width: `${SEAT_BTN.w * 100}%`,
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
  )
}

function PlayerSlot({
  seat,
  player,
  lobby,
  canTakeSeat,
}: {
  seat: Seat
  player: Occupant | null
  lobby: LobbyApi
  /** the viewer has no seat yet, so an empty seat offers the plus */
  canTakeSeat: boolean
}) {
  const frame = LOBBY_ART.frameFlat
  const interactive = player?.isLocal === true

  return (
    <div
      className="z-20"
      style={{
        ...boxStyle(SEAT_WIDGETS[seat]),
        aspectRatio: `${frame.bw} / ${frame.bh}`,
      }}
    >
      <Art art={frame} className="absolute inset-0" />
      <div
        className="z-30 flex items-center justify-center overflow-hidden"
        style={fracStyle(FRAME.plate)}
      >
        <span
          className="truncate px-[6%] font-heading font-bold"
          style={{
            fontSize: px(12),
            color: player ? PARCHMENT_INK : 'rgba(74,52,24,0.45)',
            fontStyle: player ? undefined : 'italic',
          }}
        >
          {player?.username ?? 'Empty Seat'}
        </span>
      </div>

      <button
        type="button"
        disabled={!interactive}
        className="flex items-center justify-center disabled:cursor-default"
        style={{ ...fracStyle(FRAME.strip), cursor: interactive ? 'pointer' : undefined }}
        onClick={interactive ? lobby.toggleReady : undefined}
        title={interactive ? (player.ready ? 'Become unready' : 'Become ready') : undefined}
      >
        {player && (
          <span
            className="font-heading font-bold tracking-widest"
            style={{
              fontSize: px(7.5),
              color: player.ready ? READY_GREEN : GOLD_DIM,
              textShadow: `0 ${px(1)} ${px(3)} rgba(0,0,0,0.9)`,
            }}
          >
            {player.isHost ? 'HOST · ' : ''}{player.ready ? 'READY' : 'IDLE'}
          </span>
        )}
      </button>

      {/* the avatar ring: + on an empty seat (take it = Ready) while the
          viewer has no seat yet, − on the viewer's own seat (leave it =
          unready), another player's initial otherwise */}
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
        {player && !(player.isLocal && player.ready) && (
          <span
            className="font-heading font-bold"
            style={{
              fontSize: px(24),
              color: GOLD,
              textShadow: `0 0 ${px(8)} rgba(80,150,255,0.6), 0 ${px(1.5)} ${px(4)} rgba(0,0,0,0.9)`,
            }}
          >
            {player.username.trim().charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      {!player && canTakeSeat && (
        <MedallionButton art={LOBBY_ART.addFlat} title="Take this seat" onClick={lobby.toggleReady} />
      )}
      {player?.isLocal && player.ready && (
        <MedallionButton art={LOBBY_ART.removeFlat} title="Leave your seat" onClick={lobby.toggleReady} />
      )}
    </div>
  )
}

function SettingsPanel() {
  const art = LOBBY_ART.settingsFlat
  const g = SETTINGS_GRID
  const rowH = g.h / g.rows
  return (
    <div
      className="z-20"
      style={{
        ...boxStyle(SETTINGS_WIDGET),
        aspectRatio: `${art.bw} / ${art.bh}`,
      }}
    >
      <Art art={art} className="absolute inset-0" />
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: `${g.x * 100}%`,
          top: `${g.y * 100}%`,
          width: `${g.w * g.split * 100}%`,
          height: `${rowH * 100}%`,
        }}
      >
        <span style={{ fontSize: px(11), color: GOLD_DIM }}>Game Config</span>
      </div>
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: `${(g.x + g.w * g.split) * 100}%`,
          top: `${g.y * 100}%`,
          width: `${g.w * (1 - g.split) * 100}%`,
          height: `${rowH * 100}%`,
        }}
      >
        <span className="font-bold" style={{ fontSize: px(11.5), color: GOLD }}>
          Default
        </span>
      </div>
    </div>
  )
}

export default function LobbyView({ lobby }: { lobby: LobbyApi }) {
  const snapshot = lobby.snapshot
  const startArt = LOBBY_ART.startFlat
  const readyCount = snapshot?.readyPlayers.length ?? 0
  const canStart = readyCount >= 2 && readyCount <= 4
  const occupants: Occupant[] = snapshot
    ? [
        ...snapshot.readyPlayers.map((player) => ({
          ...player,
          isHost:
            player.accountId === snapshot.readyPlayers[0]?.accountId ||
            (player.accountId === snapshot.self.accountId && snapshot.self.isHost),
          isLocal: player.accountId === snapshot.self.accountId,
          ready: true,
        })),
        ...(snapshot.readyPlayers.some(
          (player) => player.accountId === snapshot.self.accountId,
        )
          ? []
          : [{ ...snapshot.self, isLocal: true, ready: false }]),
      ].slice(0, 4)
    : []

  return (
    <div className="lobby-root fixed inset-0 select-none overflow-hidden bg-zinc-950 font-heading">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `url("${LOBBY_ART.backgroundEmpty.url}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <div
        className="lobby-stage absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 [container-type:size]"
        style={{
          width: 'min(100vw, calc(100vh * 16 / 9))',
          height: 'min(100vh, calc(100vw * 9 / 16))',
        }}
      >
        {/* the two art layers, each placed by LAYERS (lobbyLayout.ts) — a
            Box like every widget, so the frames can be scaled and moved */}
        {/* the side bars are not drawn any more (the owner, 2026-09-03) —
            the seat frames stand on the table by themselves; the bar art
            and LAYERS.sideBar* stay available should they come back */}
        <img
          src={LOBBY_ART.centerFrame.url}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none z-10 object-fill"
          style={{ ...boxStyle(LAYERS.centerFrame), aspectRatio: '1672 / 941' }}
        />

        {([0, 1, 2, 3] as Seat[]).map((seat) => (
          <PlayerSlot
            key={seat}
            seat={seat}
            player={occupants[seat] ?? null}
            lobby={lobby}
            canTakeSeat={!!snapshot && snapshot.self.state === 'IDLE'}
          />
        ))}
        <SettingsPanel />

        {snapshot?.self.isHost && (
          <button
            type="button"
            disabled={!canStart}
            title={canStart ? 'Start the game' : 'Two to four ready players are required'}
            onClick={lobby.startGame}
            className={`z-30 transition-[transform,filter] duration-150 ${
              canStart
                ? 'cursor-pointer hover:scale-[1.04] hover:brightness-125 active:scale-95'
                : 'brightness-[0.55] saturate-[0.6]'
            }`}
            style={{
              ...boxStyle(START_WIDGET),
              aspectRatio: `${startArt.bw} / ${startArt.bh}`,
              ...artStyle(startArt),
            }}
          >
            <span className="sr-only">Start game</span>
          </button>
        )}

        <button
          type="button"
          onClick={lobby.logout}
          className="absolute right-[3%] top-[2%] z-40 rounded border border-amber-500/70 bg-zinc-950/80 px-[1.2cqw] py-[.45cqw] text-[.8cqw] font-bold uppercase tracking-widest text-amber-200 hover:bg-amber-950"
        >
          Logout
        </button>

        {(lobby.loading || lobby.error) && (
          <div className="absolute bottom-[3%] left-1/2 z-40 -translate-x-1/2 rounded border border-amber-500/60 bg-zinc-950/90 px-[1.3cqw] py-[.55cqw] text-[.9cqw] text-amber-100 shadow-xl">
            {lobby.loading ? 'Opening the lobby…' : lobby.error}
          </div>
        )}
      </div>
    </div>
  )
}
