import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask, ConfirmTask } from '../../tasks/choose-tasks'
import { DrawTask } from '../../tasks/draw-task'
import { SacrificeTask } from '../../tasks/hero-tasks'

// Arctic Aries (monster-128)
//   Passive:    after a successful hero-effect roll, you may draw.
//   Fight back: Sacrifice one of your heroes.
// OwnerEvent on RollSuccess is exactly "you succeed on a hero ability roll":
// a leader's activation announces LeaderActivated, its own event, so it never
// fires this (2026-09-04; before that it also drew on the Shadow Claw).
const DRAW_A_CARD = 'ArcticAriesDrawsCard'

export const ArcticAriesAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.OwnerEvent },
    steps: [
      new ConfirmTask({ confirms: DRAW_A_CARD, question: 'Draw a card?' }),
    ],
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
      new ChooseCardTask(
        { zone: Zone.Party, owner: Owner.Self },
        { question: 'Choose a hero to sacrifice' },
      ),
      new SacrificeTask(),
    ],
  },
]
