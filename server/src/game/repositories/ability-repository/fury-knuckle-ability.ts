import { CardType, GameEventType, Owner, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChoosePlayerTask } from '../../tasks/choose-tasks'
import { CardTypeCondition } from '../../tasks/conditions'
import { PullCardTask } from '../../tasks/tasks'
import { CTX_PULLED_CARD_IDS } from '../../abilities/ability-context'

// Fury Knuckle (hero-002): "Pull a card from another player's hand. If it is
// a Challenge card, pull a second card from that player's hand."
//
//   [0] RollSuccess → choose a player → pull → is the pulled card a Challenge?
//   [1] ConditionMet (this card's label) → pull again from THE SAME player
//
// The condition carries the chosen seat across with the tested slot
// (`carriedSeat`), so entry [1]'s PullCardTask reads the same
// CTX_CHOSEN_PLAYER and the second pull hits the same hand — the player is
// never asked twice.
const PULLED_A_CHALLENGE = 'FuryKnucklePulledChallenge'

export const FuryKnuckleAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChoosePlayerTask({ owner: Owner.Others }),
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
