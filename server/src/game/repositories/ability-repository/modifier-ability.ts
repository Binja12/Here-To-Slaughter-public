import { GameEventType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ApplyModifierTask } from '../../tasks/modifier-tasks'

// Modifier (modifier-077 … modifier-101): "Reaction: after any player rolls, adjust that roll by +2 or -2."
//
//   [0] ModifierPlayed on this card → land the value that came with the play
//
// ONE declaration for all 25 printed copies, though they carry four different
// value sets: the value is the player's pick off the card's printed face,
// verified by PlayModifierReaction and carried on the event as ctxSeed, so
// what differs between copies is card data and not a second declaration.
//
// ONE step, no window: the card asks nothing of the player that the play did
// not already say. The Protecting Horn is the contrast — a leader that asks
// its own "+1 or -1" through a ChooseValueTask before the same ApplyModifier.
//
// SelfCard: `ModifierPlayed` names the card that was spent. The card reaches
// this at all because `spendCard` puts it in its owner's instance pile, which
// `abilitySources` scans — a card in the discard is not a source.
//
// Nothing here puts the card away. The frame it was spent into owns it, and
// `releaseFrame` discards it when the roll settles.
export const ModifierAbility: IAbilityRule[] = [
  {
    trigger: {
      on: GameEventType.ModifierPlayed,
      scope: TriggerScope.SelfCard,
    },
    steps: [new ApplyModifierTask()],
  },
]
