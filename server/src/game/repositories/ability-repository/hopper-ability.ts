import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import { CTX_CHOSEN_PLAYER } from '../../abilities/ability-context'
import { ChooseCardTask, ChoosePlayerTask } from '../../tasks/choose-tasks'
import { SacrificeTask } from '../../tasks/hero-tasks'

// Hopper (hero-033): "Choose a player. That player must SACRIFICE a Hero card."
//
//   [0] RollPassing → I choose a player with heroes, while the roll still stands
//   [1] RollSuccess → THEY choose one of their heroes → they sacrifice it
//
// Sacrifice, not destroy: the victim gives the hero up, so CantBeDestroyed
// does not shield it and the announcement names the victim as the loser.
export const HopperAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [new ChoosePlayerTask({ owner: Owner.Others, hasHeroes: true }), new TargetRollTask(CTX_CHOSEN_PLAYER, Zone.Party)],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.Chosen, executor: 'chosen' }),
      new SacrificeTask({ executor: 'chosen' }),
    ],
  },
]
