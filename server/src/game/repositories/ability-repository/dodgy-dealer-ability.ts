import { GameEventType, Owner, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChoosePlayerTask } from '../../tasks/choose-tasks'
import { TradeHandsTask } from '../../tasks/tasks'

// Dodgy Dealer (hero-046): "Trade hands with another player."
//
//   [0] RollSuccess → choose another player → the two hands change places
//
// Whole hands, empty ones included; one HandsTraded announces it.
export const DodgyDealerAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [new ChoosePlayerTask({ owner: Owner.Others }), new TradeHandsTask()],
  },
]
