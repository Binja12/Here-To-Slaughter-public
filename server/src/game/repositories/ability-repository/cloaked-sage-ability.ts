import { GameEventType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { DrawTask } from '../../tasks/tasks'

// The Cloaked Sage (leader-120): "Each time you play a Magic card, DRAW a card."
//
//   [0] MagicPlayed by my owner → draw one
//
// OwnerEvent, not SelfCard: the event names the MAGIC card, and this entry
// belongs to the leader watching it go down.
//
// MagicPlayed rather than the settled frame, which is what a played card's own
// steps hang off (§1). A leader is not the card being played, and
// `frameResolved` carries no playerId, so OwnerEvent could never match it and
// SelfCard would name the magic card instead of this one.
//
// Triggering on the attempt still tracks the outcome. `playMagic` opens its
// frame BEFORE it announces, so this draw happens inside the snapshot: a lost
// challenge rolls the card back out of the instance pile and takes the drawn
// card with it.
//
// Both routes into `playMagic` emit it — a player's PlayMagicAction and an
// ability's PlayMagicTask — which is what "each time you play" asks for.
export const CloakedSageAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.MagicPlayed, scope: TriggerScope.OwnerEvent },
    steps: [new DrawTask(1)],
  },
]
