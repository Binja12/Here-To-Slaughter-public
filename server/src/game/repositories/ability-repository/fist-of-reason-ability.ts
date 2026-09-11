import { GameEventType, PassiveType, RollContext, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'

// The Fist of Reason (leader-118): "Add 2 to your rolls when challenging."
//
//   [0] GameStarted → install the bonus, permanently
//
// A leader is never played, never moves and never leaves, so a passive printed
// on one has no card movement to trigger it. `GameStarted` is the only event
// before the first roll, and the bonus has to be standing by then.
//
// Anyone, not OwnerEvent: the event belongs to the table and carries no
// playerId. Every leader in play matches it and each installs on its own
// owner, because the pipeline carries `ownerId` and the event does not.
//
// No expiry, which means permanent (§7) — what a leader's printed passive is.
//
// RollContext.Challenge reaches the CHALLENGER's roll only. ChallengeWindow
// asks with the context for the challenger and with none for the defender,
// because defending is not challenging — the card says "when challenging".
// An unscoped bonus like Wise Shield still covers both sides.
const BONUS = 2

export const FistOfReasonAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.GameStarted, scope: TriggerScope.Anyone },
    steps: [
      new ApplyEffectTask({
        type: PassiveType.RollBonus,
        value: BONUS,
        rollContext: RollContext.Challenge,
      }),
    ],
  },
]
