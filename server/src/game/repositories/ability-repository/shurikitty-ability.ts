import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { DestroyTask } from '../../tasks/hero-tasks'
import { RetrieveCardTask } from '../../tasks/item-tasks'
import { CTX_DESTROYED_HERO_ITEM } from '../../abilities/ability-context'

// Shurikitty (hero-023): "DESTROY a Hero card. If that Hero card had an Item
// card equipped to it, add that Item card to your hand instead of moving it
// to the discard pile."
//
//   [0] RollSuccess → choose a hero → destroy it → its gear, if any, out of
//       the pile into your hand
//
// The destroy drops the gear on the pile as it always does — silently, no
// discard is announced for gear that fell — and names it in
// CTX_DESTROYED_HERO_ITEM; the retrieve picks it back out, announced as a
// retrieve, not a draw. "Instead of" is thus two moves that read as one:
// nothing fires on the pile stop. A destroy that did not happen (Decoy Doll,
// a hero that cannot be destroyed, a steal in its place) names nothing.
export const ShurikittyAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.All }),
      new DestroyTask(),
      new RetrieveCardTask(CTX_DESTROYED_HERO_ITEM),
    ],
  },
]
