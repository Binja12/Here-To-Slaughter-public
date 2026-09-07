import { GameEventType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseValueTask } from '../../tasks/choose-tasks'
import { ApplyModifierTask } from '../../tasks/modifier-tasks'

// The Protecting Horn (leader-121): "Each time you play a Modifier card on a
// roll, +1 or -1 to that roll."
//
//   [0] ModifierPlayed by my owner → offer 1 or -1, land the pick
//
// The same two steps a modifier card's own entry runs, with the numbers passed
// in rather than read off a card: the leader grants what a modifier card
// grants, so it runs that mechanic instead of a copy of it. Without them this
// wording had nowhere to go — nothing could put a bonus into an open window
// except the reaction that spends a card.
//
// OwnerEvent, not SelfCard: the event names the MODIFIER card, and this entry
// belongs to the leader watching it be played. "On a roll" needs no test —
// ModifierPlayed only happens into an open roll.
//
// Both entries match the same event, and TaskManager runs the card the event
// NAMES before anything watching it, so the card's own bonus lands first and
// the Horn's second. A sum does not care: see ApplyModifierTask for why.
const HORN_VALUES = [1, -1]

export const ProtectingHornAbility: IAbilityRule[] = [
  {
    trigger: {
      on: GameEventType.ModifierPlayed,
      scope: TriggerScope.OwnerEvent,
    },
    steps: [
      new ChooseValueTask(HORN_VALUES, 'Choose +1 or -1 for the roll'),
      new ApplyModifierTask(),
    ],
  },
]
