import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { StealFromPartyTask } from '../../tasks/hero-tasks'
import { RollOnHeroTask } from '../../tasks/roll-on-hero-task'
import { ChooseCardTask, ConfirmTask } from '../../tasks/choose-tasks'
import { CTX_STOLEN_HERO_ID } from '../../abilities/ability-context'

// Wiggles (hero-036): "STEAL a Hero card and roll to use its effect immediately"
//
//   [0] RollSuccess on Wiggles     → choose a target, steal it, ask about rolling
//   [1] TaskConfirmed 'RollOnHero' → roll on what was taken
//
// Split at the question because a confirm is always the last step of its entry.
// DISMISS emits no event, so entry [1] never fires and the steal stands. A
// failed roll keeps the hero too: its frame is opened after the steal.
//
// No confirm at the front — rolling on Wiggles is itself the opt-in.
const CONFIRMS_ROLL = 'RollOnHero'

export const WigglesAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.Others }),
      new StealFromPartyTask(),
      // subjectKey does double duty: it skips the prompt when nothing was
      // stolen, and rides the stolen hero across to entry [1], which runs with
      // a fresh context and cannot see this one's blackboard.
      new ConfirmTask({
        confirms: CONFIRMS_ROLL,
        subjectKey: CTX_STOLEN_HERO_ID,
      }),
    ],
  },
  {
    trigger: {
      on: GameEventType.TaskConfirmed,
      scope: TriggerScope.SelfCard,
      when: CONFIRMS_ROLL,
    },
    steps: [new RollOnHeroTask(CTX_STOLEN_HERO_ID)],
  },
]
