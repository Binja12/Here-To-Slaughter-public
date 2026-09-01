import { GameEventType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { DrawTask } from '../../tasks/draw-task'

// Particularly Rusty Coin (item-062, item-063): "When the wearer fails its ability roll, draw a card."
//
//   [0] RollFailed on the carrier → draw one
//
// The Suspiciously Shiny Coin's mirror: same scope, opposite event, and a
// reward where that one charges a price. CarrierCard because RollFailed names
// the HERO — OwnerEvent would pay out on every failed roll its owner made,
// including rolls on heroes this coin is not riding.
//
// It works at all because ModifierWindow announces the failure AFTER rolling
// the frame back. The draw therefore happens on live state, outside the frame
// that just went away, so the reward for failing is not undone by the failure.
const REWARD = 1

export const ParticularlyRustyCoinAbility: IAbilityRule[] = [
  {
    trigger: {
      on: GameEventType.RollFailed,
      scope: TriggerScope.CarrierCard,
    },
    steps: [new DrawTask(REWARD)],
  },
]
