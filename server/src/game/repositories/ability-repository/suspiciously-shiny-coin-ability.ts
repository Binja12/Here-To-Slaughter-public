import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbility } from '../../interfaces'
import { DiscardTask } from '../../tasks/tasks'
import { ChooseCardTask } from '../../tasks/choose-tasks'

// Suspiciously Shiny Coin (item-073): "If you successfully roll to use the
// equipped Hero card's effect, DISCARD a card."
//
//   [0] RollSuccess on the carrier → ask which card to lose, discard it
//
// CarrierCard, not SelfCard: RollSuccess names the HERO, and this entry belongs
// to the item riding on it. OwnerEvent would fire on every roll its owner made,
// including rolls on other heroes.
//
// The card is CURSED, so it is played onto an opponent's hero — and the ability
// is derived from the item's position, so `ownerId` is the hero's owner. The
// discard lands on the player who rolled, which is the point of the card.
//
// A cost, not an offer: an idle player still pays, because a card choice
// defaults to a random one of its options (§4).
export const SuspiciouslyShinyCoinAbility: IAbility[] = [
  {
    trigger: {
      on: GameEventType.RollSuccess,
      scope: TriggerScope.CarrierCard,
    },
    steps: [
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Self }),
      new DiscardTask(),
    ],
  },
]
