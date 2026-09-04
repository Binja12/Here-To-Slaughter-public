import { ICard } from 'shared'
import type { GameState } from '../pipelines/game-state'
import { HeroCardData, HeroClass, CardType } from 'shared'

export class HeroCard implements ICard {
  constructor(private data: HeroCardData) {}

  getData(): HeroCardData {
    return { ...this.data }
  }

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
  /**
   * The class PRINTED on the card — the default. What the board reads may
   * differ while the hero wears a class mask; ask `GameState.getHeroClass`
   * for that. This is what the board falls back to when the mask comes off.
   */
  getDefaultClass(): HeroClass {
    return this.data.heroClass
  }

  /** The printed class. Prefer getDefaultClass, or GameState.getHeroClass for the class in play. */
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
