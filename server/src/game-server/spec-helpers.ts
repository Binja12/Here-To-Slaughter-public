import { CardType, DEFAULT_GAME_SETTINGS, GamePhase, WinConditionType } from 'shared'
import type { CardBase, HeroCardData, SeatedAccount } from 'shared'
import { baseGameCards } from '../data/base-game-cards'
import type { Game } from '../game/setup/create-game'
import {
  ALL_MONSTERS,
  QUIET_LEADERS,
  SHUFFLE_PIN,
  assertShufflePinnable,
  config,
  padded,
  printed,
} from '../game/setup/play-through-helpers'
import type { Deal as StackedDeal } from '../game/setup/play-through-helpers'
import { playerView } from '../game/views/player-view'
import { CommandDispatcherService } from './command-dispatcher.service'
import type { Deal, GameRegistryService, RunningGame } from './game-registry.service'
import type {
  IGameSessionResolver,
  ResolvedAccount,
} from './session/game-session.resolver'

// ---------------------------------------------------------------------------
// What the game-server specs share. Beside the specs the way
// `setup/play-through-helpers.ts` sits beside the engine's, and not a spec
// itself, so importing it runs no cases twice.
// ---------------------------------------------------------------------------

// --- Who sits down -------------------------------------------------------

/** Seats named after their ids, for cases where the name is beside the point. */
export const seated = (accountIds: readonly string[]): SeatedAccount[] =>
  accountIds.map((accountId) => ({ accountId, username: accountId }))

const TOKEN_SUFFIX = '-token'

/** The session cookie that belongs to `accountId` under the in-memory resolver. */
export const tokenOf = (accountId: string): string =>
  `${accountId}${TOKEN_SUFFIX}`

/**
 * The lobby stood in for: the token `<account>-token` belongs to
 * `<account>`, anything else to nobody. The seam `IGameSessionResolver`
 * exists for.
 */
export class InMemorySessionResolver implements IGameSessionResolver {
  resolve(sessionToken: string): Promise<ResolvedAccount | undefined> {
    if (!sessionToken.endsWith(TOKEN_SUFFIX)) return Promise.resolve(undefined)
    const accountId = sessionToken.slice(0, -TOKEN_SUFFIX.length)
    return Promise.resolve({ accountId, username: accountId })
  }
}

// --- A table won in one turn ---------------------------------------------
//
// The engine's own shortcut (engine doc §10): `AllClassesInParty` asks the
// POOL which classes exist, so a pool holding one class makes "every class"
// mean "one hero", and the first hero played wins at the end of that turn.
// Fighters with nothing printed on them, so nothing else happens; the
// harness's short clock, so windows lapse in tests' time.

/** Fighters with no ability. hero-007 is left out with the rest of its kind. */
const QUIET_FIGHTERS = [
  'hero-001',
  'hero-002',
  'hero-003',
  'hero-004',
  'hero-005',
  'hero-006',
  'hero-008',
]

/** Any non-hero cards, to pad the deck past the deal. */
const PADDING = baseGameCards
  .filter((card) => card.type === CardType.Modifier)
  .slice(0, 12)

export const QUICK_WIN_HAND_SIZE = 2

export function quickWinDeal(): Deal {
  const heroes = QUIET_FIGHTERS.map(printed)
  const cards: CardBase[] = [
    ...QUIET_LEADERS,
    ...ALL_MONSTERS,
    ...heroes,
    ...PADDING,
  ]
  return {
    cards,
    config: config({
      startingHandSize: QUICK_WIN_HAND_SIZE,
      // The leader's class plus the first Fighter played; one is met by the leader alone.
      winConditions: [{ type: WinConditionType.PartyClasses, value: 2 }],
    }),
  }
}

/**
 * Deals a quick-win table into the registry with the shuffle pinned, the
 * way `stacked` does: seat order is the order given, and the heroes are
 * dealt first, so every seat holds Fighters and seat 0 moves first.
 */
export function dealQuickWin(
  registry: GameRegistryService,
  accountIds: string[],
): RunningGame {
  return pinned(() =>
    registry.create(seated(accountIds), DEFAULT_GAME_SETTINGS, quickWinDeal()),
  )
}

/**
 * The engine harness's `stacked` deal, into the registry instead of a bare
 * game: same pool, same config, same pinned shuffle, so a full-game script
 * written against the harness plays the same cards over sockets. Not
 * started — the seats' arrival does that.
 */
export function dealStacked(
  registry: GameRegistryService,
  spec: StackedDeal,
): RunningGame {
  const handSize = spec.handSize ?? 2
  const seats = spec.seats ?? ['alice', 'bob']
  const deck = padded(spec.deck, seats.length * handSize + (spec.slack ?? 8))
  assertShufflePinnable(deck.length)

  const monsters = spec.monsters?.map(printed) ?? []
  const cards = [
    ...QUIET_LEADERS,
    ...monsters,
    ...ALL_MONSTERS.filter(
      (m) => !monsters.some((chosen) => chosen.id === m.id),
    ),
    ...deck.map(printed),
  ]

  return pinned(() =>
    registry.create(seated(seats), DEFAULT_GAME_SETTINGS, {
      cards,
      config: config({
        startingHandSize: handSize,
        winConditions: [
          { type: WinConditionType.SlayMonsters, value: spec.winAt ?? 99 },
        ],
      }),
    }),
  )
}

/** `Math.random` pinned across one deal, which makes Fisher-Yates the identity. */
function pinned<T>(deal: () => T): T {
  const spy = jest.spyOn(Math, 'random').mockReturnValue(SHUFFLE_PIN)
  try {
    return deal()
  } finally {
    spy.mockRestore()
  }
}

// --- Playing it out ------------------------------------------------------

/** The first hero in a seat's hand. */
export function heroInHand(game: Game, accountId: string): string {
  const hero = playerView(game, accountId).hand.find(
    (card) => card.type === CardType.Hero,
  ) as HeroCardData | undefined
  if (!hero) throw new Error(`${accountId} holds no hero`)
  return hero.id
}

/** Polls the board until nothing is resolving. Throws past the deadline. */
export async function untilIdle(game: Game, deadlineMs = 3_000): Promise<void> {
  const seat = game.playerOrder[0]
  const deadline = Date.now() + deadlineMs
  while (playerView(game, seat).busy) {
    if (Date.now() > deadline) throw new Error('the board never went idle')
    await new Promise((done) => setTimeout(done, 5))
  }
}

/**
 * Wins a quick-win table through the dispatcher, the way a browser would:
 * the active seat plays a hero and the table settles (the challenge window
 * and the roll offer lapse on the clock) — the settled frame is where the
 * engine finds a party with every class and concludes, mid-turn.
 */
export async function winFirstTurn(game: Game): Promise<void> {
  const dispatcher = new CommandDispatcherService()
  const active = playerView(game, game.playerOrder[0]).currentPlayerId!
  const send = (type: string, payload: unknown = {}) =>
    dispatcher.dispatch(game, active, {
      commandId: crypto.randomUUID(),
      type,
      payload,
    })

  const played = send('PlayHero', { cardId: heroInHand(game, active) })
  if (!played.accepted) throw new Error(`PlayHero: ${JSON.stringify(played)}`)
  // The hero's frame settling is the win: the engine concludes the moment
  // an idle board qualifies, no EndTurn needed (one would be refused GameOver).
  await untilIdle(game)
  if (game.gameState.getGamePhase() !== GamePhase.Concluded) {
    throw new Error('winFirstTurn: the first hero did not end the game')
  }
}
