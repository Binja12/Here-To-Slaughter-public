// ---------------------------------------------------------------------------
// One read of the environment, at load. Every address the game process
// listens on, dials or announces lives here, so `main.game.ts`, the module
// and the gateway agree by construction rather than by three copies of the
// same `process.env` line. Defaults follow the port table in
// docs/ENGINE_INTEGRATION_PLAN.md §9: lobby HTTP 3000 + TCP 4000, game
// Socket.IO 3001 + TCP 4001.
// ---------------------------------------------------------------------------

const env = process.env

const numberOr = (value: string | undefined, fallback: number): number =>
  value ? Number(value) : fallback

/**
 * Browser origins allowed to open a socket, WITH credentials — the session
 * cookie rides the handshake only when the origin is allowed by name, never
 * under `*`. Comma-separated when set. Unset reflects whatever origin asks,
 * which is right for a local table (the client's dev-server port is not
 * this process's business) and wrong for production, which is deferred with
 * Docker and routing (contract §10).
 */
const corsOrigin = (value: string | undefined): string[] | true =>
  value
    ? value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : true

export const gameServerConfig = {
  /** Socket.IO for browsers. */
  httpPort: numberOr(env.GAME_SERVER_PORT, 3001),
  /** Internal TCP the lobby dials for `game.create`. A trust boundary. */
  tcpHost: env.GAME_SERVER_TCP_HOST ?? '127.0.0.1',
  tcpPort: numberOr(env.GAME_SERVER_TCP_PORT, 4001),
  /**
   * Where browsers reach THIS process, handed to the lobby with every created
   * game. `localhost` and not `127.0.0.1`: a cookie is bound to the HOST the
   * lobby was reached as, so a socket opened to a different spelling of the
   * same machine arrives with no cookie and is turned away at the handshake.
   */
  publicUrl: env.GAME_SERVER_PUBLIC_URL ?? 'http://localhost:3001',
  /** The lobby/auth process's TCP door: resolve-session and game.completed. */
  lobbyTcpHost: env.LOBBY_AUTH_TCP_HOST ?? '127.0.0.1',
  lobbyTcpPort: numberOr(env.LOBBY_AUTH_TCP_PORT, 4000),
  corsOrigin: corsOrigin(env.GAME_SERVER_CORS_ORIGIN),
}

/** The one CORS declaration, for the HTTP app and the gateway alike. */
export const gameServerCors = {
  origin: gameServerConfig.corsOrigin,
  credentials: true,
}
