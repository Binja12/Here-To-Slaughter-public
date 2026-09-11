import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import { StealFromPartyTask } from '../../tasks/hero-tasks'
import { RollOnHeroTask } from '../../tasks/roll-on-hero-task'
import { ChooseCardTask, ConfirmTask } from '../../tasks/choose-tasks'
import { CTX_STOLEN_HERO_ID, CTX_CHOSEN_CARD } from '../../abilities/ability-context'

// Wiggles (hero-036): "STEAL a Hero card and roll to use its effect immediately"
//
//   [0] RollPassing on Wiggles     → choose a target, while the roll still stands
//   [1] RollSuccess on Wiggles     → steal it, ask about rolling
//   [2] TaskConfirmed 'RollOnHero' → roll on what was taken
//
// Split at the question because a confirm is always the last step of its entry.
// DISMISS emits no event, so entry [2] never fires and the steal stands. A
// failed roll keeps the hero too: its frame is opened after the steal.
//
// No confirm at the front — rolling on Wiggles is itself the opt-in.
const CONFIRMS_ROLL = 'RollOnHero'

export const WigglesAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask(
        { zone: Zone.Party, owner: Owner.Others },
        { question: 'Choose a hero to steal' },
      ),
      new TargetRollTask(CTX_CHOSEN_CARD, Zone.Party),
    ],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new StealFromPartyTask(),
      // subjectKey does double duty: it skips the prompt when nothing was
      // stolen, and rides the stolen hero across to entry [2], which runs with
      // a fresh context and cannot see this one's blackboard.
      new ConfirmTask({
        confirms: CONFIRMS_ROLL,
        question: "Roll to use the stolen hero's effect?",
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
