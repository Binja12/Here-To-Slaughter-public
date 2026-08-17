import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbility } from '../interfaces'
import { RollOnHeroTask, StealFromPartyTask } from '../tasks/tasks'
import { ChooseCardTask, ConfirmTask } from '../tasks/choose-tasks'
import { CTX_STOLEN_HERO_ID } from '../ability-context'

// Wiggles (hero-036): "STEAL a Hero card and roll to use its effect immediately"
//
// Steps:
//   1. ConfirmTask    — opt in before anything happens. DISMISS restores the
//                       frame, and the rollback discards this pipeline, so the
//                       steal can never be cancelled after it has already run.
//   2. ChooseCardTask — pick an enemy hero; the pick is reported through the
//                       frame result, like every other window's outcome.
//   3. StealFromPartyTask  — moves that hero into the owner's party and records it
//                       as CTX_STOLEN_HERO_ID for the step after it.
//   4. RollOnHeroTask — rolls on the stolen hero, snapshots GS, opens a
//                       modifier window and suspends. On resolve: if
//                       finalRoll >= rollReq, RollSuccess fires (triggering the
//                       stolen hero's own ability).
//
// NOTE: a failed roll does NOT undo the steal. This frame is opened by step 4,
// so its snapshot already contains step 3's steal — only the roll is rolled
// back. That matches the card text ("STEAL a Hero card AND roll to use its
// effect"): the steal is unconditional, the effect is what you gamble for.
//
// Every step from 1, 2 and 4 suspends the pipeline on its own frame.
//
// Trigger: RollSuccess on Wiggles herself.

export const WigglesAbility: IAbility = {
  // SelfCard: Wiggles reacts to HER OWN successful roll, not the table's.
  trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
  steps: [
    new ConfirmTask(),
    new ChooseCardTask({ zone: Zone.Party, owner: Owner.Others }),
    new StealFromPartyTask(),
    new RollOnHeroTask(CTX_STOLEN_HERO_ID),
  ],
}
