import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { DrawTask, DiscardTask } from '../../tasks/tasks'
import { ChooseCardTask } from '../../tasks/choose-tasks'

// Critical Boost (magic-053, magic-054): "DRAW 3 cards and DISCARD a card."
//
//   [0] FrameResolved on this card → draw 3, ask which card to lose, discard it
//
// The settled challenge frame, not MagicPlayed: the play is announced when the
// card reaches the instance pile and is challenged from there. A defeated card
// is rolled back out of that pile, so it is not among the sources this event
// is matched against and the entry never runs.
//
// ONE entry, even though it pauses. The choice window suspends the pipeline in
// place and FrameResolved wakes it with CTX_CHOSEN_CARD filled, so the discard
// is a later STEP of the same run.
//
// The player picks from their hand AFTER the draw, so a freshly drawn card is
// a legal thing to throw away. Picking nothing — an idle player — discards
// nothing; the empty slot travels and DiscardTask skips itself.
//
// Nothing here puts the Boost away: instance-rules.ts does, on AbilityDone.
export const CriticalBoostAbility: IAbilityRule[] = [
  {
    trigger: {
      on: GameEventType.FrameResolved,
      scope: TriggerScope.SelfCard,
    },
    steps: [
      new DrawTask(3),
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Self }),
      new DiscardTask(),
    ],
  },
]
