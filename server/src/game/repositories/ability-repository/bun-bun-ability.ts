import { CardType, GameEventType, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { RetrieveCardTask } from '../../tasks/item-tasks'
import { ChooseCardTask } from '../../tasks/choose-tasks'

// Bun Bun (hero-039): "Take a magic card of your choice from the discard pile
// into your hand."
//
//   [0] RollSuccess on this card → a choice over the discard pile, Magic cards
//       only → the pick comes to hand
//
// The choice is a CardChoice window over the shared pile (Zone.Discard, no
// owner) filtered to the printed type; an empty pile settles it with no pick
// and the retrieve skips on the empty slot.
export const BunBunAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask(
        { zone: Zone.Discard, cardType: CardType.Magic },
        { question: 'Choose a magic card to add to your hand' },
      ),
      new RetrieveCardTask(),
    ],
  },
]
