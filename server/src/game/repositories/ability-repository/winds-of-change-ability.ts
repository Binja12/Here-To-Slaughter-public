import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { RetrieveCardTask } from '../../tasks/item-tasks'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { DrawTask } from '../../tasks/draw-task'

// Winds of Change (magic-058, magic-059): "Return an Item card equipped to any
// player's Hero card to that player's hand, then DRAW a card."
//
//   [0] the settled challenge frame → a choice over every worn item on the
//       table → it goes to ITS player's hand → the caster draws
//
// `to: 'cardOwner'`: the item goes home, not to the caster.
export const WindsOfChangeAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.FrameResolved, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask({ zone: Zone.EquippedItem, owner: Owner.All }),
      new RetrieveCardTask(undefined, 'cardOwner'),
      new DrawTask(1),
    ],
  },
]
