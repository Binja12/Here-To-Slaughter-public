import { GameEventType, HeroClass, Owner, TriggerScope, Zone } from 'shared'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { DiscardTask, ForEachPlayerTask } from '../../tasks/tasks'
import { IAbilityRule } from '../../interfaces'

// Tough Teddy (hero-006): "Each other player with a Fighter in their Party must DISCARD a card."
//
//   [0] RollSuccess → one PlayerTargeted per matching seat
//   [1] PlayerTargeted (this card's label) → that seat chooses a card of their hand and discards it
//
// Entry [1] runs once per seat with a fresh context; the seat rides in as
// CTX_CHOSEN_PLAYER. Seats are announced in reverse so the runs, which stack,
// resolve in seat order.
const LABEL = 'ToughTeddy'

export const ToughTeddyAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [new ForEachPlayerTask({ owner: Owner.Others, hasClass: HeroClass.Fighter }, LABEL)],
  },
  {
    trigger: { on: GameEventType.PlayerTargeted, scope: TriggerScope.SelfCard, when: LABEL },
    steps: [
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Chosen, executor: 'chosen' }),
      new DiscardTask({ executor: 'chosen' }),
    ],
  },
]
