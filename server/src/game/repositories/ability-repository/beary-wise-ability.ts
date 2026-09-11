import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardEachTask, ChooseCardTask } from '../../tasks/choose-tasks'
import { DiscardEachTask } from '../../tasks/tasks'
import { RetrieveCardTask } from '../../tasks/item-tasks'
import { CTX_DISCARDED_CARDS } from '../../abilities/ability-context'

// Beary Wise (hero-003): "Every opponent discards one card. Pick one of those
// discards and put it in your hand."
//
//   [0] RollSuccess → every other seat picks a card of their own hand, all
//       at once → each discards it → the owner chooses among exactly those,
//       off the pile → the pick to hand
//
// One entry, one context: the per-seat picks come back as slots
// (chosenCardOf(seat)), the discard step writes what actually left the hands
// to CTX_DISCARDED_CARDS, and the owner's choice is the pile LIMITED to that
// (`among`). A seat with no hand picks nothing and discards nothing; nobody
// discarding leaves the owner's choice with no options, and the retrieve
// behind it skips.
export const BearyWiseAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardEachTask(
        { owner: Owner.Others },
        { zone: Zone.Hand },
        'Choose a card to discard',
      ),
      new DiscardEachTask(),
      new ChooseCardTask(
        { zone: Zone.Discard, among: CTX_DISCARDED_CARDS },
        { question: 'Choose a discarded card to add to your hand' },
      ),
      new RetrieveCardTask(),
    ],
  },
]
