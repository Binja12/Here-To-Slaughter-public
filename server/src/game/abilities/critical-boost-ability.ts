import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbility } from '../interfaces'
import { DrawTask, DiscardTask } from '../tasks/tasks'
import { ChooseCardTask } from '../tasks/choose-tasks'

// Critical Boost (magic-053, magic-054): "DRAW 3 cards and DISCARD a card."
//
//   [0] MagicPlayed on this card → draw 3, ask which card to lose, discard it
//
// ONE entry, even though it pauses. The choice window suspends the pipeline in
// place and FrameResolved wakes it with CTX_CHOSEN_CARD filled, so the discard
// is a later STEP of the same run — not a continuation entry. It has to be:
// a played magic card is in the discard by the time any later event arrives,
// so nothing could match a second entry for it (§8).
//
// The player picks from their hand AFTER the draw, so a freshly drawn card is
// a legal thing to throw away. Picking nothing — an idle player — discards
// nothing; the empty slot travels and DiscardTask skips itself.
export const CriticalBoostAbility: IAbility[] = [
  {
    trigger: { on: GameEventType.MagicPlayed, scope: TriggerScope.SelfCard },
    steps: [
      new DrawTask(3),
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Self }),
      new DiscardTask(),
    ],
  },
]
