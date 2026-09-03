import { GameEventType, HeroClass, Owner, TriggerScope } from 'shared'
import { PullCardTask, ForEachPlayerTask } from '../../tasks/tasks'
import { IAbilityRule } from '../../interfaces'

// Smooth Mimimeow (hero-024): "Pull a card from the hand of each other player with a Thief in their Party."
//
//   [0] RollSuccess → one PlayerTargeted per matching seat
//   [1] PlayerTargeted (this card's label) → a blind pull from that seat (PullCardTask reads CTX_CHOSEN_PLAYER)
//
// Entry [1] runs once per seat with a fresh context; the seat rides in as
// CTX_CHOSEN_PLAYER. Seats are announced in reverse so the runs, which stack,
// resolve in seat order.
const LABEL = 'SmoothMimimeow'

export const SmoothMimimeowAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [new ForEachPlayerTask({ owner: Owner.Others, hasClass: HeroClass.Thief }, LABEL)],
  },
  {
    trigger: { on: GameEventType.PlayerTargeted, scope: TriggerScope.SelfCard, when: LABEL },
    steps: [
      new PullCardTask(),
    ],
  },
]
