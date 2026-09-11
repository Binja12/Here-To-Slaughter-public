import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { RetrieveCardTask } from '../../tasks/item-tasks'
import { ChooseCardTask } from '../../tasks/choose-tasks'

// Holy Curselifter (hero-026): "Return a Cursed Item card equipped to a Hero
// card in your Party to your hand."
//
//   [0] RollSuccess → a choice over the cursed items worn in MY party → to my hand
//
// RetrieveCardTask finds the item on a hero's gear and takes it off through
// Party.unequipItem, announcing ItemUnequipped so whatever the curse installed
// expires. The hero stays.
export const HolyCurselifterAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask(
        { zone: Zone.EquippedItem, owner: Owner.Self, cursed: true },
        { question: 'Choose a cursed item to return to your hand' },
      ),
      new RetrieveCardTask(),
    ],
  },
]
