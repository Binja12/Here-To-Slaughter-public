import { GameEventType, PassiveType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'
import { untilUnequipped } from '../../abilities/expiries'

// Curse of the Snake's Eyes (item-074, item-075): "Subtract 2 from the wearer's ability rolls."
//
//   [0] FrameResolved on this card → install the penalty
//
// The Really Big Ring turned inside out, and deliberately the same declaration
// shape: a RollBonus is a number, and nothing about the mechanism cares which
// way it points. That is what keeps "+2 to the carrier" and "-2 to the carrier"
// one mechanism rather than a bonus system and a penalty system.
//
// The settled challenge frame, not ItemEquippedToHero: that event announces the
// attempt, and a defeated item is un-equipped by the rollback, so it is not a
// source when this is matched and the penalty is never installed.
//
// scopedToCarrier is what makes it "the equipped Hero card's" roll rather than
// every roll its owner makes. CURSED, so it is played onto somebody else's
// hero and the penalty lands on THEM — the ability is derived from the item's
// position, so ownerId is the hero's owner.
// The Really Big Ring's constant with the sign flipped, and named the same:
// there is no penalty type, only a RollBonus whose value happens to be below
// zero. Every reader sums the numbers and none of them looks at the sign.
const BONUS = -2

export const CurseOfTheSnakesEyesAbility: IAbilityRule[] = [
  {
    trigger: {
      on: GameEventType.ItemEquippedToHero,
      scope: TriggerScope.SelfCard,
    },
    steps: [
      new ApplyEffectTask({
        type: PassiveType.RollBonus,
        value: BONUS,
        scopedToCarrier: true,
        expiry: untilUnequipped,
      }),
    ],
  },
]
