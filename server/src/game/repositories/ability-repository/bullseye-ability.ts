import { GameEventType, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { DrawTask, ReturnToDeckTopTask } from '../../tasks/draw-task'
import { CTX_CHOSEN_CARD, CTX_DECK_TOP_CARD } from '../../abilities/ability-context'

// Bullseye (hero-014): "Look at the top 3 cards of the deck. Add one to your
// hand, then return the other two to the top of the deck in any order."
//
//   [0] RollSuccess → a choice over the deck's top three (the choice IS the
//       look: its options are the cards) → the chosen one is drawn → a
//       second choice over the two left on top: which goes on TOP → that one
//       is moved there; the other is second by itself
//
// Nothing is peeked onto the context: both choices read the deck where it
// lies (Zone.MainDeckTop), the draw takes the named card out of the deck,
// and the queue closes over the gap. "In any order" is the player's call
// (the owner, 2026-09-06), so the order is asked, not left as the deck had it.
export const BullseyeAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask(
        { zone: Zone.MainDeckTop, top: 3 },
        { question: 'Choose a card to add to your hand' },
      ),
      new DrawTask(CTX_CHOSEN_CARD),
      new ChooseCardTask(
        { zone: Zone.MainDeckTop, top: 2 },
        { resultKey: CTX_DECK_TOP_CARD, question: 'Choose a card to put on top of the deck' },
      ),
      new ReturnToDeckTopTask(CTX_DECK_TOP_CARD),
    ],
  },
]
