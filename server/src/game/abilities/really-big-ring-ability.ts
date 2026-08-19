import { GameEventType, PassiveType, TriggerScope } from 'shared'
import { IAbility } from '../interfaces'
import { ApplyEffectTask } from '../tasks/tasks'
import { whileEquipped } from './expiries'

// Really Big Ring (item-064, item-065): "Each time you roll to use the equipped
// Hero card's effect, +2 to your roll."
//
//   [0] FrameResolved on this card → install the bonus
//
// The settled challenge frame, not ItemEquippedToHero: that event announces the
// attempt, and a defeated item is un-equipped by the rollback, so it is not a
// source when this is matched and the bonus is never installed.
//
// The bonus outlives the ability run, so it is an IEffect rather than anything
// on this entry — and it ends with the carrier, which the item's own ability
// does for free but an installed effect does not (§7).
//
// scopedToCarrier is what makes it "the equipped Hero card's" roll and not
// every roll: the passive is installed naming the carrier, and ModifierWindow
// asks for the hero it opened over. A challenge roll asks for no hero, so this
// stays out of one.
const BONUS = 2

export const ReallyBigRingAbility: IAbility[] = [
  {
    trigger: {
      on: GameEventType.FrameResolved,
      scope: TriggerScope.SelfCard,
    },
    steps: [
      new ApplyEffectTask({
        type: PassiveType.RollBonus,
        value: BONUS,
        scopedToCarrier: true,
        expiry: whileEquipped,
      }),
    ],
  },
]
