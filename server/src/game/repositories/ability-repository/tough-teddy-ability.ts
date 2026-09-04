import { GameEventType, HeroClass, Owner, TriggerScope, Zone } from 'shared'
import { ChooseCardEachTask } from '../../tasks/choose-tasks'
import { DiscardEachTask } from '../../tasks/tasks'
import { IAbilityRule } from '../../interfaces'

// Tough Teddy (hero-006): "Each other player with a Fighter in their Party must DISCARD a card."
//
//   [0] RollSuccess → every other seat with a Fighter picks a card of their
//       own hand, all at once → each discards it
//
// One frame, one question per seat (ChooseCardEachTask); the table answers
// together and the picks come back in one go. A seat with no hand picks
// nothing and discards nothing.
export const ToughTeddyAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardEachTask({ owner: Owner.Others, hasClass: HeroClass.Fighter }, { zone: Zone.Hand }),
      new DiscardEachTask(),
    ],
  },
]
