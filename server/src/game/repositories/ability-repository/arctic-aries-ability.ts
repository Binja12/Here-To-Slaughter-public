import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask, ConfirmTask } from '../../tasks/choose-tasks'
import { DrawTask } from '../../tasks/draw-task'
import { SacrificeTask } from '../../tasks/hero-tasks'

// Arctic Aries (monster-128)
//   Passive:    after a successful hero-effect roll, you may draw.
//   Fight back: SACRIFICE a Hero card.
// RollSuccess currently has no roll-context discriminator, so OwnerEvent also
// observes the owner's activated leader. See the documented limitation.
const DRAW_A_CARD = 'ArcticAriesDrawsCard'

export const ArcticAriesAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.OwnerEvent },
    steps: [new ConfirmTask({ confirms: DRAW_A_CARD })],
  },
  {
    trigger: {
      on: GameEventType.TaskConfirmed,
      scope: TriggerScope.SelfCard,
      when: DRAW_A_CARD,
    },
    steps: [new DrawTask(1)],
  },
  {
    trigger: {
      on: GameEventType.MonsterFoughtBack,
      scope: TriggerScope.Attacker,
    },
    steps: [
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.Self }),
      new SacrificeTask(),
    ],
  },
]
