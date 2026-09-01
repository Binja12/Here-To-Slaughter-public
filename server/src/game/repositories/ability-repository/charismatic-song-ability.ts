import { GameEventType, PassiveType, RollContext, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'

// The Charismatic Song (leader-119): "Add 1 to your hero ability rolls."
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
// RollContext.HeroEffect is exactly the roll ModifierWindow covers: `rollOnHero`
// is the only thing that opens that window. It therefore stays out of a
// challenge, which asks about no hero and no hero-effect roll.
const BONUS = 1

export const CharismaticSongAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.GameStarted, scope: TriggerScope.Anyone },
    steps: [
      new ApplyEffectTask({
        type: PassiveType.RollBonus,
        value: BONUS,
        rollContext: RollContext.HeroEffect,
      }),
    ],
  },
]
