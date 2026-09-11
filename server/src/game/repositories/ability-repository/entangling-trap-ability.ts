import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { CTX_DISCARDED_CARDS } from '../../abilities/ability-context'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { StealFromPartyTask } from '../../tasks/hero-tasks'
import { DiscardTask } from '../../tasks/tasks'

// Entangling Trap (magic-051, magic-052): "DISCARD 2 cards, then STEAL a Hero
// card."
//
// "THEN" is a price, so the steal is conditional on it being paid: the hero
// choice hangs off CTX_DISCARDED_CARDS, which the SECOND DiscardTask writes on
// every run — empty when the player had nothing left to give up. A hand under
// two cards therefore asks nobody and steals nothing, rather than paying what
// it can and taking the hero anyway (the owner, 2026-09-07). The same shape
// Forced Exchange uses for its give-back half (§2, and the architecture doc's
// "a conditional second clause needs no condition when it can read the FIRST
// clause's output").
export const EntanglingTrapAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.FrameResolved, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask(
        { zone: Zone.Hand, owner: Owner.Self },
        { question: 'Choose the first card to discard' },
      ),
      new DiscardTask(),
      new ChooseCardTask(
        { zone: Zone.Hand, owner: Owner.Self },
        { question: 'Choose the second card to discard' },
      ),
      new DiscardTask(),
      new ChooseCardTask(
        { zone: Zone.Party, owner: Owner.Others },
        { requiresKey: CTX_DISCARDED_CARDS, question: 'Choose a hero to steal' },
      ),
      new StealFromPartyTask(),
    ],
  },
]
