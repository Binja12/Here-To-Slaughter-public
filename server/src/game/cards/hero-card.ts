import { ICard } from 'shared'
import type { GameState } from '../pipelines/game-state'
import { HeroCardData, HeroClass, CardType } from 'shared'

export class HeroCard implements ICard {
  constructor(private data: HeroCardData) {}

  getId(): string {
    return this.data.id
  }
  getName(): string {
    return this.data.name
  }
  getType(): CardType {
    return this.data.type
  }
  getImage(): string {
    return this.data.image
  }
  getDescription(): string {
    return this.data.description
  }
  getHeroClass(): HeroClass {
    return this.data.heroClass
  }
  /**
   * What this hero is carrying. Equipment is party state, so the board has to
   * be asked — the hero only knows its own id.
   *
   * `import type` on GameState: erased at compile time, so this reads the
   * board without a runtime edge back to it (§9).
   */
  getEquippedItem(gs: GameState): string | undefined {
    return gs.getEquippedItem(this.getId())
  }

  getRollReq(): number {
    return this.data.rollReq
  }

  clone(): HeroCard {
    return new HeroCard({ ...this.data })
  }
}
