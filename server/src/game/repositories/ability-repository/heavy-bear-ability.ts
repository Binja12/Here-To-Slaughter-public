import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import { ChooseCardTask, ChoosePlayerTask } from '../../tasks/choose-tasks'
import { DiscardTask } from '../../tasks/tasks'
import { CTX_CHOSEN_PLAYER } from '../../abilities/ability-context'

// Heavy Bear (hero-004): "Pick an opponent. They discard two cards."
//
//   [0] RollPassing → I choose a player, while the roll still stands
//   [1] RollSuccess → THEY choose a card of their hand → they discard it →
//       they choose again → they discard again
//
// `executor: 'chosen'` opens the CardChoice for the chosen seat, over the
// chosen seat's own hand — a card only they can see. DiscardTask then reads
// the same seat out of CTX_CHOSEN_PLAYER, so the victim pays, not the owner.
// A hand that runs dry settles the second choice with no pick, and the
// discard behind it skips.
export const HeavyBearAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [new ChoosePlayerTask({ owner: Owner.Others }, 'Choose a player to discard 2 cards'), new TargetRollTask(CTX_CHOSEN_PLAYER, Zone.Hand)],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask(
        { zone: Zone.Hand, owner: Owner.Chosen, executor: 'chosen' },
        { question: 'Choose the first card to discard' },
      ),
      new DiscardTask({ executor: 'chosen' }),
      new ChooseCardTask(
        { zone: Zone.Hand, owner: Owner.Chosen, executor: 'chosen' },
        { question: 'Choose the second card to discard' },
      ),
      new DiscardTask({ executor: 'chosen' }),
    ],
  },
]
