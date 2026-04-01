import { PartyData } from 'shared'

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

  addHero(heroId: string): void {
    this.data.heroIds.push(heroId)
  }
  removeHero(heroId: string): void {
    this.data.heroIds = this.data.heroIds.filter((id) => id !== heroId)
  }
  addMonster(monsterId: string): void {
    this.data.monsterIds.push(monsterId)
  }
}
