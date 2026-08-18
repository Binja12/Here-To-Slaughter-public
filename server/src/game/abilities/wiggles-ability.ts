import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbility } from '../interfaces'
import { RollOnHeroTask, StealFromPartyTask } from '../tasks/tasks'
import { ChooseCardTask, ConfirmTask } from '../tasks/choose-tasks'
import { CTX_STOLEN_HERO_ID } from '../ability-context'

// Wiggles (hero-036): "STEAL a Hero card and roll to use its effect immediately"
//
// Two entries, because the ability pauses on a question and a confirm is always
// the last step of its entry:
//
//   [0] RollSuccess on Wiggles → choose a target, steal it, ask about rolling
//   [1] TaskConfirmed 'RollOnHero' → roll on what was taken
//
// The split is what makes "no" mean exactly "skip the roll" rather than "cancel
// everything after the question". DISMISS emits no event, so entry [1] simply
// never fires; the steal is already done and stays done, matching the card text
// ("STEAL a Hero card AND roll to use its effect" — two clauses, only the
// second optional). A failed roll leaves the hero for the same reason: the
// modifier frame is opened after the steal, so its snapshot contains it.
//
// There is deliberately no confirm at the FRONT. Rolling on Wiggles is itself
// the opt-in — the action point was spent and her rollReq cleared to get here.
//
// SelfCard on both: Wiggles reacts to her OWN successful roll, and to her own
// confirm. Two Wiggles in one party never answer for each other.
const CONFIRMS_ROLL = 'RollOnHero'

export const WigglesAbility: IAbility[] = [
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
