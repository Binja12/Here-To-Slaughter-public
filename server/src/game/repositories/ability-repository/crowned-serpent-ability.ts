import { GameEventType, TriggerScope, Owner, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ConfirmTask, ChooseCardTask } from '../../tasks/choose-tasks'
import { DrawTask } from '../../tasks/draw-task'
import { SacrificeTask } from '../../tasks/hero-tasks'

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
  {
    // Fight back: SACRIFICE a Hero card — the attacker gives one up (Mega
    // Slime's shape; declared here because nothing reads the printed
    // fight-back text on its own).
    trigger: { on: GameEventType.MonsterFoughtBack, scope: TriggerScope.Attacker },
    steps: [
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.Self }),
      new SacrificeTask(),
    ],
  },
]
