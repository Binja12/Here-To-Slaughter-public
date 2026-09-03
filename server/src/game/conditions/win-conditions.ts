import { GameState } from '../pipelines/game-state'
import { Player } from '../state-structures/player'
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
    for (const player of gs.getPlayers()) {
      const party = gs.getParty(player.getId())
      if (party.getMonsterCount() >= this.monsterCount) {
        return player
      }
    }
    return null
  }
}

export class AllClassesInParty {
  private reqHeroClasses: HeroClass[]
  private repo: ICardRepository
  /** How many DISTINCT classes a party needs; the config's `value`, six by default. */
  private readonly required: number

  /**
   * "A hero of every class" counts against the classes the GAME has, never
   * the classes the dealt pool happens to hold. Reading the pool was a trap: a
   * pool of three heroes made two classes "all of them" and handed out a win
   * on the second hero played (seen live 2026-09-04, implemented-only deal).
   * `required` is the config's `value` — six for the real game, one for a
   * harness that wants the first hero to win — capped at the classes there are.
   */
  constructor(repo: ICardRepository, required = Object.values(HeroClass).length) {
    this.repo = repo
    this.reqHeroClasses = Object.values(HeroClass)
    this.required = Math.min(required, this.reqHeroClasses.length)
  }

  check(gs: GameState): Player | null {
    for (const player of gs.getPlayers()) {
      const party = gs.getParty(player.getId())!
      const playerHeroClasses = party
        .getHeroIds() // all heros id
        .map((id) => this.repo.getById(id) as HeroCardData) // convert from string to card types
        .filter((card) => card !== null) // removes null
        .map((card) => card.heroClass) // convert each card type into the hero class

      const uniqueClasses = new Set(
        playerHeroClasses.filter((cls) => this.reqHeroClasses.includes(cls)),
      )
      if (uniqueClasses.size >= this.required) return player
    }
    return null
  }
}
