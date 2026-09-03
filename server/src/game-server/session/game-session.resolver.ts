export const GAME_SESSION_RESOLVER = Symbol('IGameSessionResolver')

/** Who a session token belongs to, as the lobby/auth process knows it. */
export type ResolvedAccount = {
  accountId: string
  username: string
}

/**
 * Turns the cookie a socket handshake carries into an account. The game
 * process has no session store of its own — sessions live in the lobby/auth
 * process's memory (contract §2) — so the answer has to come from there.
 *
 * `undefined` is an EXPECTED outcome: an unknown, revoked or expired token,
 * which the gateway turns into a refused connection. A lobby that cannot be
 * reached is not expected, and THROWS: an outage must read as an outage,
 * never as a player being turned away.
 */
export interface IGameSessionResolver {
  resolve(sessionToken: string): Promise<ResolvedAccount | undefined>
}
