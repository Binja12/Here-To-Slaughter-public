import { CardType, GameEventType, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { RetrieveCardTask } from '../../tasks/item-tasks'
import { ChooseCardTask } from '../../tasks/choose-tasks'

// Call to the Fallen (magic-061): "Take a hero of your choice from the discard
// pile into your hand."
// A magic card: it fires once its own challenge window settles in its favour.
//
//   [0] the settled challenge frame → a choice over the discard pile, Hero cards
//       only → the pick comes to hand
//
// The choice is a CardChoice window over the shared pile (Zone.Discard, no
// owner) filtered to the printed type; an empty pile settles it with no pick
// and the retrieve skips on the empty slot.
export const CallToTheFallenAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.FrameResolved, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask(
        { zone: Zone.Discard, cardType: CardType.Hero },
        { question: 'Choose a hero to add to your hand' },
      ),
      new RetrieveCardTask(),
    ],
  },
]
