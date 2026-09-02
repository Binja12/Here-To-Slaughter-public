import { ICard, RollResult, RollCompareMode } from 'shared'
import { MonsterCardData, CardType, HeroClass, PartyReq } from 'shared'

export class MonsterCard implements ICard {
  constructor(private data: MonsterCardData) {}

  getData(): MonsterCardData {
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
  getPartyReq(): PartyReq {
    return this.data.partyReq
  }
  /**
   * Whether a party of these hero classes may attack this monster at all.
   *
   * `partyReq.classes` is a MULTISET, not a set: `[Bard, 'Any']` asks for a
   * Bard AND a second hero, so two Bards qualify and one Bard alone does not.
   * Each entry consumes a DIFFERENT hero, which is why this counts down a pool
   * rather than asking `includes` per entry.
   *
   * Named classes are matched first and `'Any'` takes whatever is left. That
   * ordering is what makes the greedy pass correct: `'Any'` can be satisfied by
   * any hero a named entry rejects, so spending a hero on a named entry can
   * never cost a match that some other assignment would have found.
   *
   * The classes rather than the board: a monster in the row belongs to nobody,
   * so it cannot look a party up — the caller says whose party is asking.
   */
  canBeAttackedBy(heroClasses: HeroClass[]): boolean {
    const pool = [...heroClasses]
    let anyCount = 0

    for (const required of this.data.partyReq.classes) {
      if (required === 'Any') {
        anyCount++
        continue
      }
      const at = pool.indexOf(required)
      if (at === -1) return false
      pool.splice(at, 1)
    }

    return pool.length >= anyCount
  }

  trySlay(roll: number): RollResult {
    if (this.data.rollCompareMode === RollCompareMode.HighToWin) {
      return roll >= this.data.higherReq
        ? RollResult.Slay
        : roll <= this.data.lowerReq
          ? RollResult.FightBack
          : RollResult.Miss
    } else {
      return roll <= this.data.higherReq
        ? RollResult.Slay
        : roll >= this.data.lowerReq
          ? RollResult.FightBack
          : RollResult.Miss
    }
  }
}
