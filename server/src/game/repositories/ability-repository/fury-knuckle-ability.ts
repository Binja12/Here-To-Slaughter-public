import { CardType, GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import { ChoosePlayerTask } from '../../tasks/choose-tasks'
import { CardTypeCondition } from '../../tasks/conditions'
import { PullCardTask } from '../../tasks/tasks'
import { CTX_CHOSEN_PLAYER, CTX_PULLED_CARD_IDS } from '../../abilities/ability-context'

// Fury Knuckle (hero-002): "Pull a card from another player's hand. If it is
// a Challenge card, pull a second card from that player's hand."
//
//   [0] RollPassing → choose a player, while the roll still stands
//   [1] RollSuccess → pull → is the pulled card a Challenge?
//   [2] ConditionMet (this card's label) → pull again from THE SAME player
//
// The condition carries the chosen seat across with the tested slot
// (`carriedSeat`), so entry [2]'s PullCardTask reads the same
// CTX_CHOSEN_PLAYER and the second pull hits the same hand — the player is
// never asked twice.
const PULLED_A_CHALLENGE = 'FuryKnucklePulledChallenge'

export const FuryKnuckleAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [
      new ChoosePlayerTask(
        { owner: Owner.Others },
        'Choose a player to pull a card from',
      ),
      new TargetRollTask(CTX_CHOSEN_PLAYER, Zone.Hand),
    ],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new PullCardTask(),
      new CardTypeCondition(CardType.Challenge, CTX_PULLED_CARD_IDS, PULLED_A_CHALLENGE),
    ],
  },
  {
    trigger: {
      on: GameEventType.ConditionMet,
      scope: TriggerScope.SelfCard,
      when: PULLED_A_CHALLENGE,
    },
    steps: [new PullCardTask()],
  },
]
