import { GameEventType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseValueTask } from '../../tasks/choose-tasks'
import { ApplyModifierTask } from '../../tasks/modifier-tasks'

// Modifier (modifier-077 … modifier-101): "Play this card after any player
// (including you) rolls the dice. +2 or -2 to that roll."
//
//   [0] ModifierPlayed on this card → offer its numbers, land the pick
//
// ONE declaration for all 25 printed copies, though they carry four different
// value sets. ChooseValueTask with no argument offers the card's OWN printed
// `values`, so what differs between copies is card data and not a second
// declaration.
//
// ONE entry, even though it pauses: the choice window suspends the pipeline in
// place and FrameResolved wakes it with CTX_CHOSEN_VALUE filled, so applying
// the bonus is a later STEP of the same run (Critical Boost is the reference).
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
    steps: [new ChooseValueTask(), new ApplyModifierTask()],
  },
]
