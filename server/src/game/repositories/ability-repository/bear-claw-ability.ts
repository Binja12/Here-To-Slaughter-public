import { CardType, GameEventType, Owner, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChoosePlayerTask } from '../../tasks/choose-tasks'
import { CardTypeCondition } from '../../tasks/conditions'
import { PullCardTask } from '../../tasks/tasks'
import { CTX_PULLED_CARD_IDS } from '../../abilities/ability-context'

// Bear Claw (hero-005): "Pull a card from another player's hand. If it is a
// Hero card, pull a second card from that player's hand."
//
//   [0] RollSuccess → choose a player → pull → is the pulled card a Hero?
//   [1] ConditionMet (this card's label) → pull again from THE SAME player
//
// Fury Knuckle's shape with the type changed: the chosen seat rides across
// the condition, so the second pull reaches the same hand.
const PULLED_A_HERO = 'BearClawPulledHero'

export const BearClawAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChoosePlayerTask({ owner: Owner.Others }),
      new PullCardTask(),
      new CardTypeCondition(CardType.Hero, CTX_PULLED_CARD_IDS, PULLED_A_HERO),
    ],
  },
  {
    trigger: {
      on: GameEventType.ConditionMet,
      scope: TriggerScope.SelfCard,
      when: PULLED_A_HERO,
    },
    steps: [new PullCardTask()],
  },
]
