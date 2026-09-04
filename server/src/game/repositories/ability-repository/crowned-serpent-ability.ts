import { GameEventType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ConfirmTask } from '../../tasks/choose-tasks'
import { DrawTask } from '../../tasks/draw-task'

// Crowned Serpent (monster-125): "Each time any player (including you) plays
// a Modifier card, you may DRAW a card."
//
//   [0] ModifierPlayed, anyone's → the owner is asked
//   [1] TaskConfirmed (this card's label) → draw one
//
// Anyone, not OwnerEvent: the modifier's player is whoever it was, and the
// monster's owner is the one who may draw — the pipeline carries the owner.
const MAY_DRAW = 'CrownedSerpentDraws'

export const CrownedSerpentAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.ModifierPlayed, scope: TriggerScope.Anyone },
    steps: [new ConfirmTask({ confirms: MAY_DRAW })],
  },
  {
    trigger: { on: GameEventType.TaskConfirmed, scope: TriggerScope.SelfCard, when: MAY_DRAW },
    steps: [new DrawTask(1)],
  },
]
