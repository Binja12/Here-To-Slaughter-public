import { GameEventType, PassiveType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'
import { untilUnequipped } from '../../abilities/expiries'

// Decoy Doll (item-066): "If the equipped Hero card would be sacrificed or
// destroyed, move Decoy Doll to the discard pile instead."
//
//   [0] equipped → install TakesTheHit on the carrier's owner, scoped to the
//       carrier, for as long as the doll is worn
//
// A replacement effect, read by DestroyTask AND SacrificeTask at the moment
// of the loss: the doll comes off the hero (ItemUnequipped, which is also
// what ends this effect) and goes to the discard pile, and the hero stays.
// Really Big Ring's shape — the effect names its carrier — with the
// opposite purpose.
export const DecoyDollAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.ItemEquippedToHero, scope: TriggerScope.SelfCard },
    steps: [
      new ApplyEffectTask({
        type: PassiveType.TakesTheHit,
        scopedToCarrier: true,
        expiry: untilUnequipped,
      }),
    ],
  },
]
