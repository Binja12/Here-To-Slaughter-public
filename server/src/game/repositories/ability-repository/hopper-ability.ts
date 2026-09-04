import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask, ChoosePlayerTask } from '../../tasks/choose-tasks'
import { SacrificeTask } from '../../tasks/hero-tasks'

// Hopper (hero-033): "Choose a player. That player must SACRIFICE a Hero card."
//
//   [0] RollSuccess → I choose a player with heroes → THEY choose one of their
//       heroes → they sacrifice it
//
// Sacrifice, not destroy: the victim gives the hero up, so CantBeDestroyed
// does not shield it and the announcement names the victim as the loser.
export const HopperAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChoosePlayerTask({ owner: Owner.Others, hasHeroes: true }),
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.Chosen, executor: 'chosen' }),
      new SacrificeTask({ executor: 'chosen' }),
    ],
  },
]
