import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { StealFromPartyTask } from '../../tasks/hero-tasks'
import { DiscardTask } from '../../tasks/tasks'

// Entangling Trap (magic-051, magic-052): "DISCARD 2 cards, then STEAL a Hero
// card."
export const EntanglingTrapAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.FrameResolved, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Self }),
      new DiscardTask(),
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Self }),
      new DiscardTask(),
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.Others }),
      new StealFromPartyTask(),
    ],
  },
]
