import { IGameEventEmitter, PartyData } from 'shared'
import { GameEventFactory } from '../events/game-event-factory'

/** Why a hero entered a party. */
export type HeroAddReason = 'Played' | 'Stolen' | 'Reborn' | 'Given'

/** Why a hero left a party. */
export type HeroRemovalReason =
  | 'Stolen'
  | 'Destroyed'
  | 'Sacrificed'
  | 'Given'

// ---------------------------------------------------------------------------
// Party — membership, and the choke point for changing it.
//
// addHero/removeHero REQUIRE an emitter and a reason, so party membership
// cannot change without announcing it. That is deliberate: ongoing effect
// expiries key off HeroAddedToParty / HeroRemovedFromParty, and an unannounced
// mutation would leave them believing something that is no longer true. Making
// the emitter a parameter is what turns that from a convention into a rule the
// compiler enforces.
//
// Adding a new way to gain or lose a hero means a new `reason`, not a new event
// and not an update to every listener.
// ---------------------------------------------------------------------------

export class Party {
  constructor(private data: PartyData) {}

  getPlayerId(): string {
    return this.data.playerId
  }
  /** Set when the party is built and never changed: a leader does not move. */
  getLeaderId(): string {
    return this.data.leaderId
  }
  getHeroIds(): string[] {
    return this.data.heroIds
  }
  getMonsterIds(): string[] {
    return this.data.monsterIds
  }
  getMonsterCount(): number {
    return this.data.monsterIds.length
  }

  /** `carriedItemId` is what the hero brings with it — see removeHero. */
  addHero(
    heroId: string,
    em: IGameEventEmitter,
    reason: HeroAddReason,
    carriedItemId?: string,
  ): void {
    this.data.heroIds.push(heroId)
    em.emit(
      GameEventFactory.heroAddedToParty(this.getPlayerId(), heroId, reason),
    )
    // AFTER the hero is in and announced: the item's own entry triggers on
    // this, and it has to find its carrier standing in THIS party to scope
    // itself to. Announced, because gear cannot move silently either — an
    // effect the item installed is re-installed by exactly this event.
    if (carriedItemId) {
      this.equipItem(heroId, carriedItemId)
      em.emit(
        GameEventFactory.itemEquipedToHero(
          this.getPlayerId(),
          carriedItemId,
          heroId,
        ),
      )
    }
  }

  /**
   * Returns the item the hero was carrying, and drops it from this party.
   *
   * A return value rather than a silent delete: every caller has to decide
   * where the gear goes — back onto the hero in its new party, or into the
   * discard with it — and the compiler makes that a choice rather than an
   * omission, the same way the emitter does for the announcement.
   */
  removeHero(
    heroId: string,
    em: IGameEventEmitter,
    reason: HeroRemovalReason,
  ): string | undefined {
    const carriedItemId = this.getEquippedItem(heroId)

    // The gear comes off FIRST, and says so. That is what makes ItemUnequipped
    // the one door every installed effect can hang its lifetime on: a carrier
    // leaving play and an item being replaced are now the same announcement.
    if (this.data.equipment) delete this.data.equipment[heroId]
    if (carriedItemId) {
      em.emit(
        GameEventFactory.itemUnequipped(
          this.getPlayerId(),
          carriedItemId,
          heroId,
        ),
      )
    }

    this.data.heroIds = this.data.heroIds.filter((id) => id !== heroId)
    em.emit(
      GameEventFactory.heroRemovedFromParty(this.getPlayerId(), heroId, reason),
    )
    return carriedItemId
  }

  getEquippedItem(heroId: string): string | undefined {
    return this.data.equipment?.[heroId]
  }

  equipItem(heroId: string, itemId: string): void {
    if (!this.data.equipment) this.data.equipment = {}
    this.data.equipment[heroId] = itemId
  }

  /**
   * Takes the gear off a hero who stays in the party, and returns it. Silent,
   * like equipItem — the caller announces, and the caller decides where the
   * item goes, exactly as removeHero makes it decide.
   */
  unequipItem(heroId: string): string | undefined {
    const itemId = this.getEquippedItem(heroId)
    if (this.data.equipment) delete this.data.equipment[heroId]
    return itemId
  }
  addMonster(monsterId: string): void {
    this.data.monsterIds.push(monsterId)
  }

  getInstanceCardIds(): string[] {
    return this.data.instanceCardIds ?? []
  }
  addInstanceCard(cardId: string): void {
    if (!this.data.instanceCardIds) this.data.instanceCardIds = []
    this.data.instanceCardIds.push(cardId)
  }
  removeInstanceCard(cardId: string): void {
    if (!this.data.instanceCardIds) return
    this.data.instanceCardIds = this.data.instanceCardIds.filter(
      (id) => id !== cardId,
    )
  }

  clone(): Party {
    return new Party({
      ...this.data,
      heroIds: [...this.data.heroIds],
      monsterIds: [...this.data.monsterIds],
      instanceCardIds: this.data.instanceCardIds
        ? [...this.data.instanceCardIds]
        : undefined,
      equipment: this.data.equipment ? { ...this.data.equipment } : undefined,
    })
  }
}
