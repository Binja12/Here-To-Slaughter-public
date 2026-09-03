import { CardType, WinConditionType } from 'shared'
import type { CardBase, HeroCardData } from 'shared'
import { baseGameCards } from '../data/base-game-cards'
import type { Game } from '../game/setup/create-game'
import {
  ALL_MONSTERS,
  QUIET_LEADERS,
  SHUFFLE_PIN,
  config,
  printed,
} from '../game/setup/play-through-helpers'
import { playerView } from '../game/views/player-view'
import { CommandDispatcherService } from './command-dispatcher.service'
import type { Deal, GameRegistryService, RunningGame } from './game-registry.service'

// ---------------------------------------------------------------------------
// What the game-server specs share: a table that can be WON in one turn,
// and the moves that win it. Beside the specs the way
// `setup/play-through-helpers.ts` sits beside the engine's, and not a spec
// itself, so importing it runs no cases twice.
//
// The win is the engine's own shortcut (engine doc §11): `AllClassesInParty`
// asks the POOL which classes exist, so a pool holding one class makes
// "every class" mean "one hero", and the first hero played wins at the end
// of that turn. Fighters with nothing printed on them, so nothing else
// happens; the harness's short clock, so windows lapse in tests' time.
// ---------------------------------------------------------------------------

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
      winConditions: [{ type: WinConditionType.PartyClasses, value: 1 }],
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
  const pinned = jest.spyOn(Math, 'random').mockReturnValue(SHUFFLE_PIN)
  try {
    return registry.create(accountIds, 'default', quickWinDeal())
  } finally {
    pinned.mockRestore()
  }
}

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
 * the active seat plays a hero, the table settles (the challenge window
 * and the roll offer lapse on the clock), and the seat ends its turn — at
 * which point the engine finds a party with every class and concludes.
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
  await untilIdle(game)
  const ended = send('EndTurn')
  if (!ended.accepted) throw new Error(`EndTurn: ${JSON.stringify(ended)}`)
}
