import { CardBase, CardType, GameConfig, WinConditionType } from 'shared'
import { baseGameCards } from '../../data/base-game-cards'
import { IWinCondition } from '../interfaces'
import { defaultGameConfig } from '../config/game-config'
import { buildCard } from '../cards/card-factory'
import { GameState } from '../pipelines/game-state'
import { ReactionManager } from '../pipelines/reaction-manager'
import { TaskManager } from '../pipelines/task-manager'
import { TurnManager } from '../pipelines/turn-manager'
import { GameEngine } from '../game-engine'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardPile } from '../state-structures/card-pile'
import { CardStack } from '../state-structures/card-stack'
import { InMemoryCardRepository } from '../repositories/in-memory-card-repository'
import { AllClassesInParty, SlayMonsters } from '../conditions/win-conditions'

// ---------------------------------------------------------------------------
// createGame — a dealt, wired, ready-to-start game.
//
// The one place that turns `GameConfig` + a list of players into everything the
// engine needs. Nothing above this belongs to the engine: how the request
// arrived is the transport's business, and this takes player IDS because that
// is all a game needs to know about who is playing.
//
// It does NOT start the game. Dealing and starting are separate because the
// first `TurnStarted` is a point of no return, and a caller may want to hold a
// dealt table while the last player connects. `startGame()` is the second half.
// ---------------------------------------------------------------------------

/** How many monsters stand face up. The row refills as they are slain. */
const MONSTER_ROW_SIZE = 3

/** Cards that go in the main deck. Monsters have their own; leaders have none. */
const MAIN_DECK_TYPES: readonly CardType[] = [
  CardType.Hero,
  CardType.Item,
  CardType.Magic,
  CardType.Modifier,
  CardType.Challenge,
]

/**
 * Everything a running game is made of. Handed back whole rather than hidden,
 * because the pieces are what a caller drives: `turnManager.enqueue` takes a
 * player's action, `reactionManager.submitReaction` takes a reaction, and the
 * emitter is where a projection layer would listen.
 */
export type Game = {
  gameId: string
  /** Seat order, randomised at deal. Turn rotation follows it. */
  playerOrder: string[]
  gameState: GameState
  emitter: GameEventEmitter
  reactionManager: ReactionManager
  turnManager: TurnManager
  taskManager: TaskManager
  engine: GameEngine
}

export type CreateGameOptions = {
  gameId?: string
  config?: GameConfig
  /** All printed cards to draw the deck from. Filtered by `config.cardSets`. */
  cards?: CardBase[]
  /**
   * What to call each seat, by player id; a seat not named here is called by
   * its id. Display only — nothing in the engine reads a name — and shaped
   * like `cards`: an option the caller may fix, defaulting to the same thing
   * the engine would have done.
   */
  names?: Readonly<Record<string, string>>
}

export function createGame(
  playerIds: readonly string[],
  options: CreateGameOptions = {},
): Game {
  const config = options.config ?? defaultGameConfig
  const gameId = options.gameId ?? crypto.randomUUID()
  const pool = (options.cards ?? baseGameCards).filter((card) =>
    config.cardSets.includes(card.set),
  )

  assertSeats(playerIds, config)

  // --- Cards: data -> objects, grouped by where they start ---------------

  const byType = (type: CardType) => pool.filter((card) => card.type === type)
  const leaders = byType(CardType.Leader)
  const monsters = byType(CardType.Monster)
  const deckCards = pool.filter((card) => MAIN_DECK_TYPES.includes(card.type))

  assertEnough(leaders.length, playerIds.length, 'leaders')
  assertEnough(monsters.length, MONSTER_ROW_SIZE, 'monsters')
  assertEnough(deckCards.length, playerIds.length * config.startingHandSize, 'deck cards')

  const mainDeck = new CardStack('main-deck', 'Main deck')
  const monsterDeck = new CardStack('monster-deck', 'Monster deck')
  const discardPile = new CardPile('discard-pile', 'Discard pile')
  const monsterPile = new CardPile('monster-pile', 'Monster row')

  const gameState = new GameState(
    mainDeck,
    discardPile,
    monsterDeck,
    monsterPile,
  )

  // Every card in the pool is registered, wherever it starts: a card the
  // engine cannot look up by id is a card no rule can act on.
  for (const data of pool) gameState.registerCard(buildCard(data))

  for (const card of deckCards) mainDeck.addToBottom(card.id)
  for (const card of monsters) monsterDeck.addToBottom(card.id)
  mainDeck.shuffle()
  monsterDeck.shuffle()

  // --- Seats: order first, so nothing downstream depends on join order ---

  const playerOrder = shuffled([...playerIds])
  const dealtLeaders = shuffled([...leaders])

  for (const [seat, playerId] of playerOrder.entries()) {
    gameState.registerPlayer(
      new Player({
        id: playerId,
        name: options.names?.[playerId] ?? playerId,
        hand: [],
        partyId: `${playerId}-party`,
        actionPoints: config.actionPointsPerTurn,
      }),
    )
    // A party and its leader come into existence together: `leaderId` is set
    // here and never changes, which is why a leader is never played (§1).
    gameState.registerParty(
      new Party({
        playerId,
        leaderId: dealtLeaders[seat].id,
        heroIds: [],
        monsterIds: [],
      }),
    )
  }

  // --- The deal ----------------------------------------------------------

  for (let i = 0; i < MONSTER_ROW_SIZE; i++) {
    const monsterId = monsterDeck.draw()
    if (monsterId) monsterPile.add(monsterId)
  }

  for (const playerId of playerOrder) {
    const player = gameState.getPlayer(playerId)!
    for (let i = 0; i < config.startingHandSize; i++) {
      const cardId = mainDeck.draw()
      if (cardId) player.addToHand(cardId)
    }
  }

  // --- Wiring ------------------------------------------------------------
  //
  // ORDER IS LOAD-BEARING. TaskManager registers itself as a listener in its
  // constructor and MUST be on the emitter before GameEngine (§8): the last
  // drain of a turn is whichever FrameResolved leaves the board idle, and only
  // GameEngine.resumeDrain runs it. With GameEngine first, TaskManager is still
  // holding the stack when that drain arrives, and a turn ending on an
  // ability's final step never ends at all. Nothing throws when this is wrong.

  const emitter = new GameEventEmitter()
  // Every reaction window's countdown comes from here, each taking its own
  // share of it (see WINDOW_SHARE). One config value moves them all together,
  // which is what lets a simulation run on 50ms windows without changing a
  // single rule.
  const reactionManager = new ReactionManager(
    gameState,
    emitter,
    config.timeControl.reactionCountdownMs,
  )
  const turnManager = new TurnManager(gameState, emitter)
  const taskManager = new TaskManager(gameState, emitter, reactionManager)
  const engine = new GameEngine(
    gameState,
    turnManager,
    emitter,
    buildWinConditions(config, pool),
  )

  return {
    gameId,
    playerOrder,
    gameState,
    emitter,
    reactionManager,
    turnManager,
    taskManager,
    engine,
  }
}

/**
 * Opens the game: `GameStarted`, then the first turn.
 *
 * A function OVER the game rather than a method ON it, so `Game` stays data —
 * it is a bag of the pieces a caller drives, and a closure in there would be
 * the one thing in it that could not be inspected, logged or handed across a
 * boundary. It exists at all because `engine` and `playerOrder` have to be
 * paired correctly and a caller passing the wrong order would silently work.
 *
 * Separate from the deal because the first `TurnStarted` is a point of no
 * return. By the time it runs the leaders are already seated, which is what
 * three of the six need — they install their passive on `GameStarted` and
 * would silently install nothing if dealt afterwards (§7).
 */
export function startGame(game: Game): void {
  game.engine.start(game.playerOrder)
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Win condition DATA -> instances. The config carries `{ type, value }`;
 * GameEngine wants objects with a `check`. AllClassesInParty reads the card
 * pool to learn which classes exist at all, which is what the repository is
 * for.
 */
function buildWinConditions(
  config: GameConfig,
  pool: CardBase[],
): IWinCondition[] {
  const repository = new InMemoryCardRepository()
  repository.addMany(pool)

  return config.winConditions.map((wc) => {
    switch (wc.type) {
      case WinConditionType.SlayMonsters:
        return new SlayMonsters(wc.value)
      case WinConditionType.PartyClasses:
        return new AllClassesInParty(repository)
    }
    const unhandled: never = wc.type
    throw new Error(`createGame: no win condition for ${String(unhandled)}`)
  })
}

/** Fisher-Yates on a copy. Seat order and leader assignment share it. */
function shuffled<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

/**
 * THROWS rather than dealing a broken table. A game built with the wrong
 * number of seats is a caller mistake, and every failure below is one the
 * caller could have checked — so it fails here, loudly, instead of surfacing
 * later as an undealt hand or a party with no leader (§11.2).
 */
function assertSeats(playerIds: readonly string[], config: GameConfig): void {
  const { min, max } = config.playerCount
  if (playerIds.length < min || playerIds.length > max) {
    throw new Error(
      `createGame: ${playerIds.length} players — this game seats ${min} to ${max}.`,
    )
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error('createGame: the same player was seated twice.')
  }
}

function assertEnough(have: number, need: number, what: string): void {
  if (have < need) {
    throw new Error(
      `createGame: ${have} ${what} in the configured card sets, ${need} needed.`,
    )
  }
}
