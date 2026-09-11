import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import { CTX_CHOSEN_PLAYER } from '../../abilities/ability-context'
import { ChoosePlayerTask } from '../../tasks/choose-tasks'
import { TradeHandsTask } from '../../tasks/tasks'

// Dodgy Dealer (hero-046): "Swap your whole hand with another player's."
//
//   [0] RollPassing → choose another player, while the roll still stands
//   [1] RollSuccess → the two hands change places
//
// Whole hands, empty ones included; one HandsTraded announces it.
export const DodgyDealerAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [
      new ChoosePlayerTask({ owner: Owner.Others }, 'Choose a player to trade hands with'),
      new TargetRollTask(CTX_CHOSEN_PLAYER, Zone.Hand),
    ],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new TradeHandsTask(),
    ],
  },
]
