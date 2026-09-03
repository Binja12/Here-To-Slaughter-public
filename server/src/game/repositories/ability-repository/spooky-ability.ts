import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { SacrificeTask } from '../../tasks/hero-tasks'
import { IAbilityRule } from '../../interfaces'
import { ForEachPlayerTask } from '../../tasks/tasks'

// Spooky (hero-035): "Each other player must SACRIFICE a Hero card."
//
//   [0] RollSuccess → one PlayerTargeted per matching seat
//   [1] PlayerTargeted (this card's label) → that seat chooses one of their heroes and sacrifices it
//
// Entry [1] runs once per seat with a fresh context; the seat rides in as
// CTX_CHOSEN_PLAYER. Seats are announced in reverse so the runs, which stack,
// resolve in seat order.
const LABEL = 'Spooky'

export const SpookyAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [new ForEachPlayerTask({ owner: Owner.Others, hasHeroes: true }, LABEL)],
  },
  {
    trigger: { on: GameEventType.PlayerTargeted, scope: TriggerScope.SelfCard, when: LABEL },
    steps: [
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.Chosen, executor: 'chosen' }),
      new SacrificeTask({ executor: 'chosen' }),
    ],
  },
]
