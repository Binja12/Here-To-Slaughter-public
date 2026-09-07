import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { ChooseCardEachTask } from '../../tasks/choose-tasks'
import { IAbilityRule } from '../../interfaces'
import { RetrieveEachTask } from '../../tasks/item-tasks'

// Greedy Cheeks (hero-047): "Each other player must give you a card from their hand."
//
//   [0] RollSuccess → every other seat picks a card of their own hand, all
//       at once → each pick comes to my hand
//
// One frame, one question per seat (ChooseCardEachTask); the picks are the
// seats' own, the moves are announced as pulls.
export const GreedyCheeksAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardEachTask(
        { owner: Owner.Others },
        { zone: Zone.Hand },
        'Choose a card to give away',
      ),
      new RetrieveEachTask(),
    ],
  },
]
