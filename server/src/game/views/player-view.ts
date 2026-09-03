import {
  CardView,
  EffectView,
  HeroInPlayView,
  PartyView,
  PendingWindowView,
  PlayerView,
  ReactionWindowType,
  SeatView,
} from 'shared'
import type { Game } from '../setup/create-game'
import { GameState } from '../pipelines/game-state'
import { IEffect, IReactionWindow } from '../interfaces'
import { firesOnOwnRoll } from '../repositories/ability-repository'

// ---------------------------------------------------------------------------
// The projection layer of §5: one player's screen, built from the board. The
// shape it builds is `PlayerView` in `shared/src/views.ts`.
//
// EVENT payloads still need the same treatment and do not get it here — a
// payload names every option a window was built with, so filtering state alone
// still leaks by the other route. That belongs with the transport, on HTSR-4.
// ---------------------------------------------------------------------------

/** What `playerId` may see of `game`, right now. THROWS on an unseated id. */
export function playerView(game: Game, playerId: string): PlayerView {
  const gs = game.gameState
  const you = gs.getPlayer(playerId)
  if (!you) {
    throw new Error(
      `playerView: ${playerId} is not seated at this game — there is no ` +
        'screen to draw for a player who is not playing.',
    )
  }

  return {
    gameId: game.gameId,
    playerId,
    seats: game.playerOrder.map((seatId, seat) => seatView(gs, seatId, seat)),
    currentPlayerId: gs.getCurrentPlayerId(),
    phase: gs.getGamePhase(),
    winnerId: gs.getWinnerId(),
    hand: you.getHand().map((cardId) => cardOf(gs, cardId)),
    parties: game.playerOrder.map((seatId) => partyView(gs, seatId)),
    mainDeck: { count: gs.getMainDeck().getSize() },
    monsterDeck: { count: gs.getMonsterDeck().getSize() },
    discardPile: gs
      .getDiscardPile()
      .getAll()
      .map((id) => cardOf(gs, id)),
    monsterRow: gs
      .getMonsterPile()
      .getAll()
      .map((id) => cardOf(gs, id)),
    attackableMonsterIds: gs
      .getMonsterPile()
      .getAll()
      .filter((monsterId) => gs.canAttackMonster(playerId, monsterId).accepted),
    pendingWindows: gs
      .openWindows()
      .map((window) => pendingWindowView(window, playerId)),
    busy: gs.isBusy(),
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** THROWS: a zone holding an unregistered id is a broken board (§11.2). */
function cardOf(gs: GameState, cardId: string): CardView {
  const card = gs.getCard(cardId)
  if (!card) {
    throw new Error(
      `playerView: no card registered as ${cardId} — a zone is holding an id ` +
        'the game was never dealt.',
    )
  }
  return card.getData()
}

function seatView(gs: GameState, playerId: string, seat: number): SeatView {
  const player = gs.getPlayer(playerId)!
  return {
    playerId,
    name: player.getName(),
    seat,
    isCurrentTurn: gs.getCurrentPlayerId() === playerId,
    actionPoints: player.getActionPoints(),
    handCount: player.getHandSize(),
    effects: player.getAllEffects().map(effectView),
  }
}

/** Everything but the lifetime: an expiry is a list of engine events. */
function effectView(effect: IEffect): EffectView {
  return {
    id: effect.id,
    sourceCardId: effect.sourceCardId,
    type: effect.type,
    value: effect.value,
    cardId: effect.cardId,
    rollContext: effect.rollContext,
    cardTypes: effect.cardTypes,
  }
}

function partyView(gs: GameState, playerId: string): PartyView {
  const party = gs.getParty(playerId)
  const spent = gs.getAbilitiesUsedThisTurn()

  return {
    playerId,
    leader: cardOf(gs, party.getLeaderId()),
    heroes: party.getHeroIds().map((heroId): HeroInPlayView => {
      const itemId = party.getEquippedItem(heroId)
      return {
        card: cardOf(gs, heroId),
        equippedItem: itemId ? cardOf(gs, itemId) : undefined,
        // The two questions RollOnHeroAction.canExecute asks about the hero
        // itself; the price is the seat's action points, already in the view.
        canRollOn:
          !spent.includes(heroId) && gs.canUseHeroEffect(playerId, heroId),
      }
    }),
    monsters: party.getMonsterIds().map((id) => cardOf(gs, id)),
    instanceCards: party.getInstanceCardIds().map((id) => cardOf(gs, id)),
    // The two questions RollOnLeaderAction.canExecute asks about the leader
    // itself: activatable at all, and not yet spent this turn.
    canRollOnLeader:
      firesOnOwnRoll(party.getLeaderId()) && !spent.includes(party.getLeaderId()),
  }
}

/** A roll or a challenge is watched by the whole table; a choice is one player's question. */
const TABLE_WINDOWS = new Set<ReactionWindowType>([
  ReactionWindowType.Challenge,
  ReactionWindowType.Modifier,
  ReactionWindowType.Attack,
])

/**
 * `options` and a choice's `detail` go only to the respondent: a choice over a
 * hand lists card ids. A roll's `detail` goes to everyone — deciding whether
 * to spend a modifier on somebody else's roll needs the number.
 */
function pendingWindowView(
  window: IReactionWindow,
  playerId: string,
): PendingWindowView {
  const isYours = window.getRespondentId() === playerId
  const shown = isYours || TABLE_WINDOWS.has(window.getType())
  return {
    windowId: window.getId(),
    type: window.getType(),
    respondentId: window.getRespondentId(),
    cardId: window.subjectCardId?.(),
    options: isYours ? [...window.getOptions()] : undefined,
    detail: shown ? window.getDetail() : undefined,
    deadline: window.getDeadline(),
    isYours,
  }
}
