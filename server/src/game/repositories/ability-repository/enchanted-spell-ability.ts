import { GameEventType, PassiveType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'
import { untilEndOfTurn } from '../../abilities/expiries'

// Enchanted Spell (magic-055, magic-056): "Add 2 to every roll you make for the rest of this turn."
//
//   [0] FrameResolved on this card → install the bonus
//
// Wise Shield's wording on a MAGIC card, and deliberately the same declaration:
// what a card IS has no bearing on the shape of what it does. The hero earns
// its bonus by rolling and the spell by surviving a challenge, and past that
// point the two are one entry with one step.
//
// The settled challenge frame, not MagicPlayed: MagicPlayed announces the
// attempt, and a defeated card is rolled back out of the instance pile, so it
// is not among the sources this is matched against.
//
// "ALL of your rolls" is the absent narrowing — no `cardId`, no `rollContext`,
// so hero rolls, attack rolls and challenge rolls all read it (§7). Contrast
// Really Big Ring, which names its carrier, and the Divine Arrow, which names
// a kind.
//
// Nothing here puts the spell away: instance-rules.ts does, on AbilityDone.
const BONUS = 2

export const EnchantedSpellAbility: IAbilityRule[] = [
  {
    trigger: {
      on: GameEventType.FrameResolved,
      scope: TriggerScope.SelfCard,
    },
    steps: [
      new ApplyEffectTask({
        type: PassiveType.RollBonus,
        value: BONUS,
        expiry: untilEndOfTurn,
      }),
    ],
  },
]
