import { CardType, GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import { ChoosePlayerTask } from '../../tasks/choose-tasks'
import { CardTypeCondition } from '../../tasks/conditions'
import { PullCardTask } from '../../tasks/tasks'
import { CTX_PULLED_CARD_IDS, CTX_CHOSEN_PLAYER } from '../../abilities/ability-context'

// Bear Claw (hero-005): "Take a random card from an opponent's hand. If it
// turns out to be a hero, take one more from the same hand."
//
//   [0] RollPassing → choose a player, while the roll still stands
//   [1] RollSuccess → pull → is the pulled card a Hero?
//   [2] ConditionMet (this card's label) → pull again from THE SAME player
//
// Fury Knuckle's shape with the type changed: the chosen seat rides across
// the condition, so the second pull reaches the same hand.
const PULLED_A_HERO = 'BearClawPulledHero'

export const BearClawAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [
      new ChoosePlayerTask({ owner: Owner.Others }, 'Choose a player to pull a card from'),
      new TargetRollTask(CTX_CHOSEN_PLAYER, Zone.Hand),
    ],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
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
