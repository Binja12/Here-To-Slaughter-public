import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { DiscardTask } from '../../tasks/tasks'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { DestroyTask } from '../../tasks/hero-tasks'

// Destructive Spell (magic-049, magic-050): "DISCARD a card, then DESTROY a
// Hero card."
//
//   [0] FrameResolved on this card → pay, then destroy
//
// ONE entry across two choices. A choice window suspends the pipeline in place
// and wakes it with the slot filled, so each pick is a later STEP of the same
// run — Critical Boost is the reference. Each Discard/Destroy sits directly
// behind its own choice, because the second pick overwrites CTX_CHOSEN_CARD.
//
// "then" is printed, and the step order is the whole of what enforces it: the
// price is paid before the payoff, so a player who ends up destroying nothing
// has still discarded.
//
// Owner.All on the second choice, because "a Hero card" names no side — this
// reaches across the table, and DestroyTask finds the party from the hero
// rather than assuming the caster's. Destroying your own is legal and printed.
//
// A cost, not an offer: a card choice defaults to a random one of its options
// (§4), so an idle player still pays and still destroys.
//
// Nothing here puts the spell away: instance-rules.ts does, on AbilityDone.
export const DestructiveSpellAbility: IAbilityRule[] = [
  {
    trigger: {
      on: GameEventType.FrameResolved,
      scope: TriggerScope.SelfCard,
    },
    steps: [
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Self }),
      new DiscardTask(),
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.All, destroyable: true }),
      new DestroyTask(),
    ],
  },
]
