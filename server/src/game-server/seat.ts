/** What a socket IS once seated: bound at the handshake, read by everything after. */
export type Seat = {
  gameId: string
  accountId: string
}

/**
 * The room one seat's pushes go to. One seat, one room, any number of tabs —
 * and the address both the gateway (game-started) and the publisher
 * (game:snapshot) send to, so it lives with neither.
 */
export const seatRoom = (seat: Seat): string =>
  `${seat.gameId}:${seat.accountId}`
