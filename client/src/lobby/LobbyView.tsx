import React from 'react'
import type { GameSettings, LobbyPlayer } from '../contract'
import type { LobbyApi } from '../state/useLobbyState'
import Dropdown from './Dropdown'
import {
  CARD_SET_OPTIONS,
  MONSTER_COUNT_OPTIONS,
  PLAYER_COUNT_OPTIONS,
  PRESET_OPTIONS,
  REACTION_TIME_OPTIONS,
  TURN_TIME_OPTIONS,
  WIN_CONDITION_OPTIONS,
  presetOf,
  withPreset,
  type Option,
} from './gameSettings'
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
  closed,
}: {
  seat: Seat
  player: Occupant | null
  lobby: LobbyApi
  /** the viewer has no seat yet, so an empty seat offers the plus */
  canTakeSeat: boolean
  /** beyond the settings' seat count: drawn dim, offers nothing */
  closed: boolean
}) {
  const frame = LOBBY_ART.frameFlat
  const interactive = player?.isLocal === true

  return (
    <div
      className="z-20"
      style={{
        ...boxStyle(SEAT_WIDGETS[seat]),
        aspectRatio: `${frame.bw} / ${frame.bh}`,
        filter: closed ? 'brightness(0.45) saturate(0.5)' : undefined,
        transition: 'filter 150ms',
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
          {player?.username ?? (closed ? 'Closed Seat' : 'Empty Seat')}
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
      {!player && !closed && canTakeSeat && (
        <MedallionButton art={LOBBY_ART.addFlat} title="Take this seat" onClick={lobby.toggleReady} />
      )}
      {player?.isLocal && player.ready && (
        <MedallionButton art={LOBBY_ART.removeFlat} title="Leave your seat" onClick={lobby.toggleReady} />
      )}
    </div>
  )
}

/**
 * One ledger row: the label in the left column, the value dropdown in the
 * right. `row` is the row's index in the painted 10-row ledger.
 */
function SettingsRow<T extends string | number | boolean>({
  row,
  label,
  value,
  options,
  onChange,
  editable,
}: {
  row: number
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  editable: boolean
}) {
  const g = SETTINGS_GRID
  const rowH = g.h / g.rows
  const top = `${(g.y + rowH * row) * 100}%`
  const height = `${rowH * 100}%`
  return (
    <>
      <div
        className="absolute flex items-center justify-center"
        style={{ left: `${g.x * 100}%`, top, width: `${g.w * g.split * 100}%`, height }}
      >
        <span className="truncate" style={{ fontSize: px(11), color: GOLD_DIM }}>
          {label}
        </span>
      </div>
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: `${(g.x + g.w * g.split) * 100}%`,
          top,
          width: `${g.w * (1 - g.split) * 100}%`,
          height,
          // an open list must lie over the rows beneath it
          zIndex: 40 - row,
        }}
      >
        <Dropdown value={value} options={options} onChange={onChange} editable={editable} title={label} />
      </div>
    </>
  )
}

/**
 * The host's dropdowns; everyone else reads the same values. Every change
 * sends the whole object. The preset row is derived from the values: it
 * reads Default or Fast while they match one, Custom the moment one
 * differs, and picking a preset resets every field to it.
 */
function SettingsPanel({
  settings,
  editable,
  onChange,
}: {
  settings: GameSettings
  editable: boolean
  onChange: (settings: GameSettings) => void
}) {
  const art = LOBBY_ART.settingsFlat
  const set = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) =>
    onChange({ ...settings, [key]: value })

  return (
    <div
      className="z-20"
      style={{
        ...boxStyle(SETTINGS_WIDGET),
        aspectRatio: `${art.bw} / ${art.bh}`,
      }}
    >
      <Art art={art} className="absolute inset-0" />
      <SettingsRow
        row={0}
        label="Preset"
        value={presetOf(settings)}
        options={PRESET_OPTIONS}
        onChange={(preset) => onChange(withPreset(settings, preset))}
        editable={editable}
      />
      <SettingsRow
        row={1}
        label="Players"
        value={settings.playerCount}
        options={PLAYER_COUNT_OPTIONS}
        onChange={(count) => set('playerCount', count)}
        editable={editable}
      />
      <SettingsRow
        row={2}
        label="Win by"
        value={settings.winCondition}
        options={WIN_CONDITION_OPTIONS}
        onChange={(mode) => set('winCondition', mode)}
        editable={editable}
      />
      <SettingsRow
        row={3}
        label="Monsters to slay"
        value={settings.monsterCount}
        options={MONSTER_COUNT_OPTIONS}
        onChange={(count) => set('monsterCount', count)}
        editable={editable}
      />
      <SettingsRow
        row={4}
        label="Card set"
        value={settings.cardSet}
        options={CARD_SET_OPTIONS}
        onChange={(cardSet) => set('cardSet', cardSet)}
        editable={editable}
      />
      <SettingsRow
        row={5}
        label="Turn timer"
        value={settings.turnTimeMs}
        options={TURN_TIME_OPTIONS}
        onChange={(ms) => set('turnTimeMs', ms)}
        editable={editable}
      />
      <SettingsRow
        row={6}
        label="Reaction timer"
        value={settings.reactionTimeMs}
        options={REACTION_TIME_OPTIONS}
        onChange={(ms) => set('reactionTimeMs', ms)}
        editable={editable}
      />
    </div>
  )
}

export default function LobbyView({ lobby }: { lobby: LobbyApi }) {
  const snapshot = lobby.snapshot
  const startArt = LOBBY_ART.startFlat
  const readyCount = snapshot?.readyPlayers.length ?? 0
  const seatCount = snapshot?.settings.playerCount ?? 4
  const canStart = readyCount >= 2 && readyCount <= seatCount
  // Seats show the server's ready list and nothing else: an IDLE viewer has
  // no seat until they press a plus (run book §1 item 19). Drawing the idle
  // viewer on a bench made every window look occupied by its own account.
  const occupants: Occupant[] = snapshot
    ? snapshot.readyPlayers
        .map((player) => ({
          ...player,
          isHost:
            player.accountId === snapshot.readyPlayers[0]?.accountId ||
            (player.accountId === snapshot.self.accountId && snapshot.self.isHost),
          isLocal: player.accountId === snapshot.self.accountId,
          ready: true,
        }))
        .slice(0, 4)
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
            closed={seat >= seatCount}
          />
        ))}
        {snapshot && (
          <SettingsPanel
            settings={snapshot.settings}
            editable={snapshot.self.isHost}
            onChange={(settings) => void lobby.updateSettings(settings)}
          />
        )}

        {snapshot?.self.isHost && (
          <button
            type="button"
            disabled={!canStart}
            title={canStart ? 'Start the game' : `Two to ${seatCount} ready players are required`}
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
