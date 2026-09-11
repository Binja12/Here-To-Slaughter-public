import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import { CTX_CHOSEN_PLAYER } from '../../abilities/ability-context'
import { ChoosePlayerTask, ConfirmTask } from '../../tasks/choose-tasks'
import { DrawTask } from '../../tasks/draw-task'
import { PullCardTask } from '../../tasks/tasks'

// Plundering Puma (hero-020): "Pull 2 cards from another player's hand. That
// player may DRAW a card."
//
//   [0] RollPassing → choose a player, while the roll still stands
//   [1] RollSuccess → pull → pull → ask THAT player: draw?
//   [2] TaskConfirmed (this card's label) → that player draws one
//
// The "may" belongs to the victim, so the confirm is theirs
// (`executor: 'chosen'`), and the draw runs as them too (DrawTask with
// `executor: 'chosen'`). The chosen seat rides across the confirm with the
// seed, the way it rides across a condition.
const MAY_DRAW = 'PlunderingPumaVictimDraws'

export const PlunderingPumaAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [
      new ChoosePlayerTask(
        { owner: Owner.Others },
        'Choose a player to pull 2 cards from',
      ),
      new TargetRollTask(CTX_CHOSEN_PLAYER, Zone.Hand),
    ],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new PullCardTask(),
      new PullCardTask(),
      new ConfirmTask({
        confirms: MAY_DRAW,
        question: 'Draw a card?',
        executor: 'chosen',
      }),
    ],
  },
  {
    trigger: {
      on: GameEventType.TaskConfirmed,
      scope: TriggerScope.SelfCard,
      when: MAY_DRAW,
    },
    steps: [new DrawTask(1, 'chosen')],
  },
]
