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
   * Whether a party may attack this monster at all.
   *
   * `partyReq.classes` is a MULTISET, not a set: `[Bard, 'Any']` asks for a
   * Bard AND a second hero, so two Bards qualify and one Bard alone does not.
   * Each entry consumes a DIFFERENT card, which is why this counts down a pool
   * rather than asking `includes` per entry.
   *
   * The PARTY LEADER counts, for a NAMED class only (the owner, 2026-09-08,
   * from the printed rule: "you must have a Wizard in your Party — either a
   * Hero card or the Wizard Party Leader card — in addition to a Hero card of
   * any class"). So an `'Any'` entry is heroes only, and the one leader can
   * stand in for at most one named entry. That is also why a single Wizard
   * hero cannot fill both halves of `[Wizard, 'Any']`.
   *
   * The classes rather than the board: a monster in the row belongs to nobody,
   * so it cannot look a party up — the caller says whose party is asking.
   */
  canBeAttackedBy(heroClasses: HeroClass[], leaderClass?: HeroClass): boolean {
    const required = this.data.partyReq.classes
    const named = required.filter((cls): cls is HeroClass => cls !== 'Any')
    const anyCount = required.length - named.length

    // Named entries are matched first and `'Any'` takes whatever is left. That
    // ordering is what makes the greedy pass correct: `'Any'` can be satisfied
    // by any hero a named entry rejects, so spending a hero on a named entry
    // can never cost a match some other assignment would have found.
    const heroesCover = (entries: HeroClass[]): boolean => {
      const pool = [...heroClasses]
      for (const cls of entries) {
        const at = pool.indexOf(cls)
        if (at === -1) return false
        pool.splice(at, 1)
      }
      return pool.length >= anyCount
    }

    if (heroesCover(named)) return true
    if (leaderClass === undefined) return false
    // The leader takes ONE named entry off the heroes' hands. Which of several
    // entries of that same class it takes cannot matter — they are identical.
    const at = named.indexOf(leaderClass)
    if (at === -1) return false
    return heroesCover([...named.slice(0, at), ...named.slice(at + 1)])
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
