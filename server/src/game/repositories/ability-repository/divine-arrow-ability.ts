import { GameEventType, PassiveType, RollContext, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'

// The Divine Arrow (leader-116): "Each time you roll to ATTACK a Monster
// card, +1 to your roll."
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
// RollContext.Attack is what keeps it to attacks: unscoped, the bonus would
// ride every challenge and every roll on a hero as well. AttackMonsterAction
// is the only site that asks with this context.
const BONUS = 1

export const DivineArrowAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.GameStarted, scope: TriggerScope.Anyone },
    steps: [
      new ApplyEffectTask({
        type: PassiveType.RollBonus,
        value: BONUS,
        rollContext: RollContext.Attack,
      }),
    ],
  },
]
