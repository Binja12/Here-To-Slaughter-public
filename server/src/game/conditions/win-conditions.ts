import { GameState } from '../states/game-state'
import { Player } from '../../player'
import { ICardRepository, HeroClass, HeroCardData } from 'shared'

export class SlayMonsters {
  private monsterCount: number

  constructor(monsterCount?: number) {
    this.monsterCount = monsterCount ?? 3
  }

  getMonsterCount(): number {
    return this.monsterCount
  }

  check(gs: GameState): Player | null {
    const parties = gs.getParties()
    for (const party of parties) {
      if (party.getMonsterCount() >= this.monsterCount) {
        return gs.getPlayer(party.getPlayerId())
      }
    }
    return null
  }
}

export class AllClassesInParty {
  private reqHeroClasses: HeroClass[]
  private repo: ICardRepository

  constructor(repo: ICardRepository) {
    this.repo = repo
    this.reqHeroClasses = repo.getAvailableClasses()
    //console.log('required classes', this.reqHeroClasses)
  }

  check(gs: GameState): Player | null {
    for (const player of gs.getPlayers()) {
      const party = gs.getParty(player.getId())!
      const playerHeroClasses = party
        .getHeroIds() // all heros id
        .map((id) => this.repo.getById(id) as HeroCardData) // convert from string to card types
        .filter((card) => card !== null) // removes null
        .map((card) => card.heroClass) // convert each card type into the hero class

      const uniqueClasses = new Set(playerHeroClasses)
      //console.log(uniqueClasses) // removes duplicates
      const hasAllClasses = this.reqHeroClasses.every(
        (
          cls, // checks that every element in is also in b
        ) => uniqueClasses.has(cls),
      )

      if (hasAllClasses) return player
    }
    return null
  }
}
