import { IGameEventEmitter, PartyData } from 'shared'
import { GameEventFactory } from './events/game-event-factory'

/** Why a hero entered a party. */
export type HeroAddReason = 'Played' | 'Stolen' | 'Reborn'

/** Why a hero left a party. */
export type HeroRemovalReason = 'Stolen' | 'Destroyed' | 'Sacrificed'

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

  addHero(
    heroId: string,
    em: IGameEventEmitter,
    reason: HeroAddReason,
  ): void {
    this.data.heroIds.push(heroId)
    em.emit(
      GameEventFactory.heroAddedToParty(this.getPlayerId(), heroId, reason),
    )
  }
  removeHero(
    heroId: string,
    em: IGameEventEmitter,
    reason: HeroRemovalReason,
  ): void {
    this.data.heroIds = this.data.heroIds.filter((id) => id !== heroId)
    em.emit(
      GameEventFactory.heroRemovedFromParty(this.getPlayerId(), heroId, reason),
    )
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
    this.data.instanceCardIds = this.data.instanceCardIds.filter((id) => id !== cardId)
  }

  clone(): Party {
    return new Party({
      ...this.data,
      heroIds: [...this.data.heroIds],
      monsterIds: [...this.data.monsterIds],
      instanceCardIds: this.data.instanceCardIds ? [...this.data.instanceCardIds] : undefined,
    })
  }
}
