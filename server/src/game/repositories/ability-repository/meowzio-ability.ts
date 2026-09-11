import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import { CTX_CHOSEN_PLAYER } from '../../abilities/ability-context'
import { ChooseCardTask, ChoosePlayerTask } from '../../tasks/choose-tasks'
import { StealFromPartyTask } from '../../tasks/hero-tasks'
import { PullCardTask } from '../../tasks/tasks'

// Meowzio (hero-019): pick an opponent, steal one of their heroes, then pull
// from that same player's hand.
export const MeowzioAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [
      new ChoosePlayerTask(
        { owner: Owner.Others, hasHeroes: true },
        'Choose a player to steal a hero from',
      ),
      new TargetRollTask(CTX_CHOSEN_PLAYER, Zone.Party),
    ],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask(
        { zone: Zone.Party, owner: Owner.Chosen },
        { question: 'Choose a hero to steal' },
      ),
      new StealFromPartyTask(),
      new PullCardTask(),
    ],
  },
]
