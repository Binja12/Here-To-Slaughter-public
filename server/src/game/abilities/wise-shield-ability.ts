import { GameEventType, PassiveType, TriggerScope } from 'shared'
import { IAbility } from '../interfaces'
import { ApplyEffectTask } from '../tasks/tasks'
import { untilEndOfTurn } from '../effects'

// ---------------------------------------------------------------------------
// Wise Shield (hero-028) — "+3 to all of your rolls until the end of your turn."
//
// The ability run is over immediately: one step, installs one ActiveEffect and
// finishes. The LIFETIME belongs to the effect, not to the trigger (§7) — a
// trigger can only say when a pipeline starts, never how long what it left
// behind should last.
//
// SelfCard, not OwnerEvent: rolling on a DIFFERENT hero of yours also emits
// RollSuccess with you as the player, and that must not arm Wise Shield. Only
// a successful roll on THIS card does.
//
// A single entry: nothing here pauses for a yes/no, so there is no follow-up
// to split off. The list shape is the registry's, not this card's need.
//
// The +3 lands after the roll that earned it — the effect is installed on
// RollSuccess, which the modifier window emits once the roll is already
// settled. So it never boosts its own activation, only later rolls.
// ---------------------------------------------------------------------------

const BONUS = 3

export const WiseShieldAbility: IAbility[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ApplyEffectTask({
        passive: { type: PassiveType.RollBonus, value: BONUS },
        // Card text reads "until the end of your turn" — TurnEnded, no check
        // needed, since every TurnEnded ends the turn in progress.
        expiry: untilEndOfTurn,
      }),
    ],
  },
]
