import { GameEventType, PassiveType, TriggerScope } from 'shared'
import { IAbility } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'
import { untilEndOfTurn } from '../../abilities/expiries'

// Wise Shield (hero-028): "+3 to all of your rolls until the end of your turn."
//
// One entry: nothing here pauses, so there is no follow-up to split off.
// SelfCard, not OwnerEvent — rolling on another hero also emits RollSuccess.
// The effect installs AFTER the roll that earned it, so it never boosts its own
// activation. Read by ModifierWindow and ChallengeWindow via RollBonus.
const BONUS = 3

export const WiseShieldAbility: IAbility[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ApplyEffectTask({
        type: PassiveType.RollBonus,
        value: BONUS,
        // Card text reads "until the end of your turn" — TurnEnded, no check
        // needed, since every TurnEnded ends the turn in progress.
        expiry: untilEndOfTurn,
      }),
    ],
  },
]
