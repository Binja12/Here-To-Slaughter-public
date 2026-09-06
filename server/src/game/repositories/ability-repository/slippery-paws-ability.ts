import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import { ChooseCardTask, ChoosePlayerTask } from '../../tasks/choose-tasks'
import { DiscardTask, PullCardTask } from '../../tasks/tasks'
import { CTX_PULLED_CARD_IDS, CTX_CHOSEN_PLAYER } from '../../abilities/ability-context'

// Slippery Paws (hero-022): "Pull 2 cards from another player's hand, then
// DISCARD one of those cards."
//
//   [0] RollPassing → choose a player, while the roll still stands
//   [1] RollSuccess → pull two, blind → choose one of the two out of my hand →
//       discard it
//
// "One of those cards": the hand LIMITED to what was pulled (`among` over
// CTX_PULLED_CARD_IDS), not the hand's last two — a hand has no order the
// rules know of. A hand that ran dry after one pull offers that one.
export const SlipperyPawsAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [new ChoosePlayerTask({ owner: Owner.Others }), new TargetRollTask(CTX_CHOSEN_PLAYER, Zone.Hand)],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new PullCardTask({ count: 2 }),
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Self, among: CTX_PULLED_CARD_IDS }),
      new DiscardTask(),
    ],
  },
]
