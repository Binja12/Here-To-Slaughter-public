import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { CTX_CHOSEN_PLAYER } from '../../abilities/ability-context'
import { IAbilityRule } from '../../interfaces'
import { ForEachPlayerTask } from '../../tasks/tasks'
import { RetrieveCardTask } from '../../tasks/item-tasks'

// Greedy Cheeks (hero-047): "Each other player must give you a card from their hand."
//
//   [0] RollSuccess → one PlayerTargeted per matching seat
//   [1] PlayerTargeted (this card's label) → that seat chooses a card of their hand; RetrieveCardTask brings it to mine
//
// Entry [1] runs once per seat with a fresh context; the seat rides in as
// CTX_CHOSEN_PLAYER. Seats are announced in reverse so the runs, which stack,
// resolve in seat order.
const LABEL = 'GreedyCheeks'

export const GreedyCheeksAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [new ForEachPlayerTask({ owner: Owner.Others }, LABEL)],
  },
  {
    trigger: { on: GameEventType.PlayerTargeted, scope: TriggerScope.SelfCard, when: LABEL },
    steps: [
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Chosen, executor: 'chosen' }),
      new RetrieveCardTask(),
    ],
  },
]
