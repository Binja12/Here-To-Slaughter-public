import { useCallback, useMemo, useState } from 'react';
import { socket } from '../socket/socket';
import type { Seat } from '../lobby/lobbyLayout';

/* ---------------------------------------------------------------------------
 * Lobby state — ONE hook, two data sources behind the same shape.
 *
 *   mode 'demo' (default) — pure local state, no server needed. Lets the
 *     whole lobby UI be exercised today.
 *   mode 'api' — same actions forwarded over the socket as `lobby:*`
 *     messages, state replaced by the server's `lobby:state` broadcasts.
 *     The server has no lobby gateway yet; when it lands, ONLY this adapter
 *     changes — LobbyView consumes the identical LobbyApi either way.
 *
 * Switch: REACT_APP_LOBBY_MODE=api (client/.env) or the `mode` argument.
 * ------------------------------------------------------------------------- */

export interface LobbyPlayer {
  id: string;
  seat: Seat;
  name: string;
  isHost: boolean;
  isLocal: boolean;
  ready: boolean;
}

export interface LobbySetting {
  key: string;
  label: string;
  options: string[];
  value: string;
}

export interface LobbyApi {
  players: LobbyPlayer[];
  settings: LobbySetting[];
  /** seats (0-3) with no player in them */
  openSeats: Seat[];
  canStart: boolean;
  addPlayer: (seat: Seat) => void;
  removePlayer: (id: string) => void;
  renamePlayer: (id: string, name: string) => void;
  toggleReady: (id: string) => void;
  cycleSetting: (key: string) => void;
  startGame: () => void;
}

const ALL_SEATS: Seat[] = [0, 1, 2, 3];

/* Demo defaults — 10 entries to match the flat art's 10 painted ledger rows. */
const DEMO_SETTINGS: LobbySetting[] = [
  { key: 'actionPoints', label: 'Action Points', options: ['2', '3', '4', '5'], value: '3' },
  { key: 'startingHand', label: 'Starting Hand', options: ['3', '4', '5', '6', '7'], value: '5' },
  { key: 'arenaMonsters', label: 'Arena Monsters', options: ['2', '3', '4'], value: '3' },
  { key: 'heroesToWin', label: 'Heroes To Win', options: ['4', '5', '6', '7'], value: '6' },
  { key: 'monstersToWin', label: 'Monsters To Win', options: ['2', '3', '4'], value: '3' },
  { key: 'autoPass', label: 'Auto-Pass Bots', options: ['On', 'Off'], value: 'On' },
  { key: 'turnTimer', label: 'Turn Timer', options: ['Off', '30s', '60s', '90s'], value: 'Off' },
  { key: 'cardSet', label: 'Card Set', options: ['Base Game'], value: 'Base Game' },
  { key: 'spectators', label: 'Spectators', options: ['Allowed', 'Off'], value: 'Allowed' },
  { key: 'botSkill', label: 'Bot Difficulty', options: ['Easy', 'Normal', 'Fierce'], value: 'Normal' },
];

const DEMO_PLAYERS: LobbyPlayer[] = [
  { id: 'p1', seat: 0, name: 'Player 1', isHost: true, isLocal: true, ready: true },
];

const BOT_NAMES = ['Sir Snacks-a-Lot', 'Griselda', 'Doomling', 'Bartleby'];

export type LobbyMode = 'demo' | 'api';

const DEFAULT_MODE: LobbyMode =
  (process.env.REACT_APP_LOBBY_MODE as LobbyMode) === 'api' ? 'api' : 'demo';

export function useLobbyState(
  onGameStart?: (playerCount: number) => void,
  mode: LobbyMode = DEFAULT_MODE,
): LobbyApi {
  const [players, setPlayers] = useState<LobbyPlayer[]>(DEMO_PLAYERS);
  const [settings, setSettings] = useState<LobbySetting[]>(DEMO_SETTINGS);

  /* In api mode every mutation ALSO tells the server; the local update is an
   * optimistic mirror until `lobby:state` broadcasts land (listener TODO —
   * blocked on the server gateway existing). */
  const emit = useCallback(
    (event: string, payload: unknown) => {
      if (mode === 'api') socket.emit(event, payload);
    },
    [mode],
  );

  const addPlayer = useCallback(
    (seat: Seat) => {
      setPlayers((ps) => {
        if (ps.some((p) => p.seat === seat) || ps.length >= 4) return ps;
        const bot: LobbyPlayer = {
          id: `bot-${seat}`,
          seat,
          name: BOT_NAMES[seat] ?? `Player ${seat + 1}`,
          isHost: false,
          isLocal: false,
          ready: true,
        };
        return [...ps, bot];
      });
      emit('lobby:addPlayer', { seat });
    },
    [emit],
  );

  const removePlayer = useCallback(
    (id: string) => {
      setPlayers((ps) => ps.filter((p) => p.id !== id || p.isHost));
      emit('lobby:removePlayer', { id });
    },
    [emit],
  );

  const renamePlayer = useCallback(
    (id: string, name: string) => {
      const clean = name.trim().slice(0, 18);
      if (!clean) return;
      setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, name: clean } : p)));
      emit('lobby:rename', { id, name: clean });
    },
    [emit],
  );

  const toggleReady = useCallback(
    (id: string) => {
      setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ready: !p.ready } : p)));
      emit('lobby:ready', { id });
    },
    [emit],
  );

  const cycleSetting = useCallback(
    (key: string) => {
      setSettings((ss) =>
        ss.map((s) => {
          if (s.key !== key || s.options.length < 2) return s;
          const next = s.options[(s.options.indexOf(s.value) + 1) % s.options.length];
          return { ...s, value: next };
        }),
      );
      emit('lobby:setting', { key });
    },
    [emit],
  );

  const openSeats = useMemo(
    () => ALL_SEATS.filter((s) => !players.some((p) => p.seat === s)),
    [players],
  );

  const canStart = players.length >= 1 && players.every((p) => p.ready);

  const startGame = useCallback(() => {
    if (!canStart) return;
    if (mode === 'api') {
      socket.emit('game:start', { players: Math.max(players.length, 2), autoPass: true });
    }
    onGameStart?.(players.length);
  }, [canStart, mode, players.length, onGameStart]);

  return {
    players,
    settings,
    openSeats,
    canStart,
    addPlayer,
    removePlayer,
    renamePlayer,
    toggleReady,
    cycleSetting,
    startGame,
  };
}
