import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask, ChoosePlayerTask } from '../../tasks/choose-tasks'
import { StealFromPartyTask } from '../../tasks/hero-tasks'
import { PullCardTask } from '../../tasks/tasks'

// Meowzio (hero-019): choose a player, steal one of their heroes, then pull
// from that same player's hand.
export const MeowzioAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChoosePlayerTask({ owner: Owner.Others, hasHeroes: true }),
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.Chosen }),
      new StealFromPartyTask(),
      new PullCardTask(),
    ],
  },
]
