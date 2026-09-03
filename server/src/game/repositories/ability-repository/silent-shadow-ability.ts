import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { RetrieveCardTask } from '../../tasks/item-tasks'
import { ChooseCardTask, ChoosePlayerTask } from '../../tasks/choose-tasks'

// Silent Shadow (hero-021): "Look at another player's hand. Choose a card and
// add it to your hand."
//
//   [0] RollSuccess → choose a player → choose a card of THEIR hand → take it
//
// The look IS the choice: a CardChoice over Zone.Hand / Owner.Chosen offers
// that hand's ids to the ability owner, which is what "look at" means here.
// The pick then leaves the hand as a CHOSEN card, which is the whole
// difference from a pull (PullCardTask, blind and random); RetrieveCardTask
// announces it as CardPulled all the same, since a card left one hand for
// another. Sharp Fox (hero-016), which only looks, still needs a reveal step.
export const SilentShadowAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChoosePlayerTask({ owner: Owner.Others }),
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Chosen }),
      new RetrieveCardTask(),
    ],
  },
]
