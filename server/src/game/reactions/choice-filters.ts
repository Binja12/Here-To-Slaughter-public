import { CardType, HeroClass, Owner, Zone } from 'shared'
import { GameState } from '../pipelines/game-state'
import { AbilityContext, chosenPlayers } from '../abilities/ability-context'
import { HeroCard } from '../cards/hero-card'

// ---------------------------------------------------------------------------
// Choice filters — declarative descriptions of "which cards may be picked",
// resolved against GameState at the moment a window opens.
//
// Declarative on purpose: a filter can be read, logged and sent to a client,
// which a closure could not. Everything a card needs to express should be
// expressible here rather than by passing a function.
//
// Relevance ONLY. Which cards a given client is allowed to SEE is decided by
// the projection layer that sits in front of the API — the client never
// receives the whole GameState, so visibility cannot be a per-window concern.
// ---------------------------------------------------------------------------


export type PlayerFilter = {
  owner?: Owner
  excludeIds?: string[]
}

export type CardFilter = {
  zone: Zone
  /** Ignored for shared zones (Discard, MonsterPile), which belong to nobody. */
  owner?: Owner
  cardType?: CardType
  /** Only meaningful for hero cards; non-heroes never match. */
  heroClass?: HeroClass
  /**
   * Monsters only: keep the ones the ability owner's party may legally attack,
   * by the monster's printed `partyReq`. Non-monsters never match, the same way
   * `heroClass` rejects non-heroes.
   */
  partyReqMet?: boolean
  /**
   * Heroes only: keep the ones carrying no item, so a card that plays an Item
   * offers only heroes that can actually take it. Non-heroes never match.
   */
  unequipped?: boolean
  excludeIds?: string[]
}

/**
 * Zones that belong to the table rather than to a player. Resolving owners for
 * one of these would return the same pile once per seated player.
 */
const SHARED_ZONES: ReadonlySet<Zone> = new Set([
  Zone.Discard,
  Zone.MonsterPile,
])

// ---------------------------------------------------------------------------
// The one place the static vocabulary meets live state
// ---------------------------------------------------------------------------

/**
 * Turns an Owner scope into concrete player ids.
 *
 * Abilities are declared at module load, long before a game exists, so a
 * filter can only describe WHOSE cards it wants — never name anybody. This is
 * where that description becomes a list, once ctx.ownerId and the seated
 * players are known. Owner.Chosen goes further still and defers to an earlier
 * step of the same pipeline, via CTX_CHOSEN_PLAYER.
 *
 * Returns a list because a scope can span several seats: Owner.Others in a
 * four-player game is three parties to sweep.
 */
function playersFor(
  gs: GameState,
  ctx: AbilityContext,
  owner: Owner = Owner.All,
): string[] {
  const everyone = gs.getPlayers().map((p) => p.getId())
  switch (owner) {
    case Owner.Self:
      return [ctx.ownerId]
    case Owner.Others:
      return everyone.filter((id) => id !== ctx.ownerId)
    case Owner.All:
      return everyone
    case Owner.Chosen:
      return chosenPlayers(ctx)
  }
}

export function filterPlayers(
  gs: GameState,
  ctx: AbilityContext,
  filter: PlayerFilter = {},
): string[] {
  const exclude = new Set(filter.excludeIds ?? [])
  return playersFor(gs, ctx, filter.owner ?? Owner.Others).filter(
    (id) => !exclude.has(id),
  )
}

// ---------------------------------------------------------------------------
// Card resolution
// ---------------------------------------------------------------------------

/** Card ids in one zone for one player. Discard ignores the owner. */
function idsInZone(gs: GameState, zone: Zone, ownerId: string): string[] {
  switch (zone) {
    case Zone.Hand:
      return gs.getPlayer(ownerId)?.getHand() ?? []
    case Zone.Party:
      return gs.getParty(ownerId).getHeroIds()
    case Zone.EquippedItem:
      return gs
        .getParty(ownerId)
        .getHeroIds()
        .map((heroId) => gs.getEquippedItem(heroId))
        .filter((id): id is string => !!id)
    case Zone.Discard:
      return gs.getDiscardPile().getAll()
    case Zone.MonsterPile:
      return gs.getMonsterPile().getAll()
  }
}

export function filterCards(
  gs: GameState,
  ctx: AbilityContext,
  filter: CardFilter,
): string[] {
  const exclude = new Set(filter.excludeIds ?? [])

  // A shared zone is read once, with no owner — see SHARED_ZONES.
  const ids = SHARED_ZONES.has(filter.zone)
    ? idsInZone(gs, filter.zone, '')
    : playersFor(gs, ctx, filter.owner).flatMap((ownerId) =>
        idsInZone(gs, filter.zone, ownerId),
      )

  return ids.filter((id) => {
    if (exclude.has(id)) return false

    const card = gs.getCard(id)
    if (filter.cardType && card?.getType() !== filter.cardType) return false

    if (filter.heroClass) {
      if (!(card instanceof HeroCard)) return false
      if (card.getHeroClass() !== filter.heroClass) return false
    }

    if (filter.unequipped) {
      if (!(card instanceof HeroCard)) return false
      if (gs.getEquippedItem(id)) return false
    }

    // Asked of the board rather than answered here: the same question the
    // action's canExecute and the window's canSubmit ask, so an option offered
    // is an option that can be acted on.
    if (filter.partyReqMet && !gs.canAttackMonster(ctx.ownerId, id)) return false

    return true
  })
}
