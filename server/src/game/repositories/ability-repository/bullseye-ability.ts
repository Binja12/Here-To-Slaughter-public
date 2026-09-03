import { GameEventType, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { DrawTask } from '../../tasks/draw-task'
import { CTX_CHOSEN_CARD } from '../../abilities/ability-context'

// Bullseye (hero-014): "Look at the top 3 cards of the deck. Add one to your
// hand, then return the other two to the top of the deck in any order."
//
//   [0] RollSuccess → a choice over the deck's top three (the choice IS the
//       look: its options are the cards) → the chosen one is drawn
//
// Nothing is peeked onto the context and nothing is put back: the choice
// reads the deck where it lies (Zone.MainDeckTop, top: 3), the draw takes
// the named card out of the deck, and the queue closes over the gap by
// itself — the other two are on top, in the order they were.
export const BullseyeAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask({ zone: Zone.MainDeckTop, top: 3 }),
      new DrawTask(CTX_CHOSEN_CARD),
    ],
  },
]
