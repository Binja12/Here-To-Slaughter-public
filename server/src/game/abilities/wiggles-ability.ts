import { GameEventType } from 'shared'
import { IAbility } from '../interfaces'
import { RollOnHeroTask, StealHeroTask } from '../tasks/tasks'

// Wiggles (hero-036): "STEAL a Hero card and roll to use its effect immediately"
//
// Steps:
//   1. StealHeroTask  — moves the chosen hero to the owner's party.
//   2. RollOnHeroTask — rolls dice, snapshots GS, opens a modifier-window frame
//                       and suspends. On resolve: if finalRoll >= rollReq,
//                       ReactionManager emits RollSuccess (which triggers the
//                       stolen hero's ability). If finalRoll < rollReq, the
//                       snapshot is restored (steal is undone).
//
// Trigger: RollSuccess on Wiggles herself (player rolled ≥ 10 on Wiggles).

export const WigglesAbility: IAbility = {
  trigger: GameEventType.RollSuccess,
  steps: [
    new StealHeroTask(),
    new RollOnHeroTask(),
  ],
}
