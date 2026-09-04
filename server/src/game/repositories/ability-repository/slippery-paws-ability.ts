import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask, ChoosePlayerTask } from '../../tasks/choose-tasks'
import { DiscardTask, PullCardTask } from '../../tasks/tasks'
import { CTX_PULLED_CARD_IDS } from '../../abilities/ability-context'

// Slippery Paws (hero-022): "Pull 2 cards from another player's hand, then
// DISCARD one of those cards."
//
//   [0] RollSuccess → choose a player → pull two, blind → choose one of the
//       two out of my hand → discard it
//
// "One of those cards": the hand LIMITED to what was pulled (`among` over
// CTX_PULLED_CARD_IDS), not the hand's last two — a hand has no order the
// rules know of. A hand that ran dry after one pull offers that one.
export const SlipperyPawsAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChoosePlayerTask({ owner: Owner.Others }),
      new PullCardTask({ count: 2 }),
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Self, among: CTX_PULLED_CARD_IDS }),
      new DiscardTask(),
    ],
  },
]
