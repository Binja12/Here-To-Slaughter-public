import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask, ChoosePlayerTask } from '../../tasks/choose-tasks'
import { DiscardTask } from '../../tasks/tasks'

// Heavy Bear (hero-004): "Choose a player. That player must DISCARD 2 cards."
//
//   [0] RollSuccess → I choose a player → THEY choose a card of their hand →
//       they discard it → they choose again → they discard again
//
// `executor: 'chosen'` opens the CardChoice for the chosen seat, over the
// chosen seat's own hand — a card only they can see. DiscardTask then reads
// the same seat out of CTX_CHOSEN_PLAYER, so the victim pays, not the owner.
// A hand that runs dry settles the second choice with no pick, and the
// discard behind it skips.
export const HeavyBearAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChoosePlayerTask({ owner: Owner.Others }),
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Chosen, executor: 'chosen' }),
      new DiscardTask({ executor: 'chosen' }),
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Chosen, executor: 'chosen' }),
      new DiscardTask({ executor: 'chosen' }),
    ],
  },
]
