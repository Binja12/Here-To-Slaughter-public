import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { ChooseCardEachTask } from '../../tasks/choose-tasks'
import { SacrificeEachTask } from '../../tasks/hero-tasks'
import { IAbilityRule } from '../../interfaces'

// Spooky (hero-035): "Each other player must SACRIFICE a Hero card."
//
//   [0] RollSuccess → every other seat with heroes picks one of their own,
//       all at once → each sacrifices it
//
// One frame, one question per seat (ChooseCardEachTask). The sacrifice is
// the seat's own, so Decoy Doll still takes the hit for it.
export const SpookyAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardEachTask({ owner: Owner.Others, hasHeroes: true }, { zone: Zone.Party }),
      new SacrificeEachTask(),
    ],
  },
]
