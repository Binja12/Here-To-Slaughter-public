import { ReactionWindowType } from 'shared'
import { CardChoiceWindow } from './card-choice-window'

// ---------------------------------------------------------------------------
// MonsterChoiceWindow — pick one monster out of the face-up row.
//
// A CardChoiceWindow in every respect but two, and both are about the fact
// that a monster has an entry PRICE the other zones do not: a party has to
// field what the monster's partyReq asks for before it may swing at all.
// ---------------------------------------------------------------------------

export class MonsterChoiceWindow extends CardChoiceWindow {
  override getType(): ReactionWindowType {
    return ReactionWindowType.MonsterChoice
  }

  /**
   * The same question the filter asked when it built these options, asked
   * again now. A hero can leave the party while the window is open — stolen,
   * destroyed — and take the party's claim on this monster with it.
   *
   * Refuses loudly; the base throws and leaves the window open (§4).
   */
  protected override canSubmit(choice: unknown): boolean {
    return this.gs.canAttackMonster(this.respondentId, choice as string)
      .accepted
  }

  /**
   * Silence is NOT an attack. CardChoiceWindow picks a random option so a card
   * that asks for a card cannot be dodged by waiting, which is right for a
   * price; attacking is an OFFER, and an idle player has not taken it.
   *
   * The steps behind read the empty slot and skip in turn.
   */
  protected override defaultChoice(): unknown {
    return undefined
  }
}
