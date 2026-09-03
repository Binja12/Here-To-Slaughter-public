import { GameEventType, Owner, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChoosePlayerTask, ConfirmTask } from '../../tasks/choose-tasks'
import { DrawTask } from '../../tasks/draw-task'
import { PullCardTask } from '../../tasks/tasks'

// Plundering Puma (hero-020): "Pull 2 cards from another player's hand. That
// player may DRAW a card."
//
//   [0] RollSuccess → choose a player → pull → pull → ask THAT player: draw?
//   [1] TaskConfirmed (this card's label) → that player draws one
//
// The "may" belongs to the victim, so the confirm is theirs
// (`executor: 'chosen'`), and the draw runs as them too (DrawTask with
// `executor: 'chosen'`). The chosen seat rides across the confirm with the
// seed, the way it rides across a condition.
const MAY_DRAW = 'PlunderingPumaVictimDraws'

export const PlunderingPumaAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChoosePlayerTask({ owner: Owner.Others }),
      new PullCardTask(),
      new PullCardTask(),
      new ConfirmTask({ confirms: MAY_DRAW, executor: 'chosen' }),
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
