import { GameEventType, PassiveType, TriggerScope, Owner, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'
import { DestroyTask, DESTROY_ANYWAY, STEAL_INSTEAD, StealFromPartyTask, SacrificeTask } from '../../tasks/hero-tasks'
import { CTX_WOULD_DESTROY } from '../../abilities/ability-context'
import { ChooseCardTask } from '../../tasks/choose-tasks'

// Corrupted Sabretooth (monster-122): "Each time you would DESTROY a Hero
// card, you may STEAL that Hero card instead."
//   Fight back (6 and under): SACRIFICE a Hero card — data, on the card.
//
//   [0] MonsterSlain on this card → install StealsInsteadOfDestroy on the slayer
//   [1] "Steal it instead" → the steal, of the hero the destroy was about
//   [2] "Destroy it" → the destroy, as printed, and no second question
//
// A replacement effect: it runs no steps of its own on the destroy, it makes
// DestroyTask ASK. The task, finding the effect on the destroyer, opens a
// choice of action as THIS card's question (`asCard`), with the hero it was
// about to destroy in CTX_WOULD_DESTROY; the answer comes back here as
// TaskConfirmed, and silence is the printed destroy. The steal goes through
// StealFromPartyTask, so it announces itself and honours CantBeStolen.
// Warworn Owlbear's shape: a slain monster sits in the winner's party for
// good, so no expiry.
export const CorruptedSabretoothAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.MonsterSlain, scope: TriggerScope.SelfCard },
    steps: [new ApplyEffectTask({ type: PassiveType.StealsInsteadOfDestroy })],
  },
  {
    trigger: { on: GameEventType.TaskConfirmed, scope: TriggerScope.SelfCard, when: STEAL_INSTEAD },
    steps: [new StealFromPartyTask(CTX_WOULD_DESTROY)],
  },
  {
    trigger: { on: GameEventType.TaskConfirmed, scope: TriggerScope.SelfCard, when: DESTROY_ANYWAY },
    steps: [new DestroyTask({ fromKey: CTX_WOULD_DESTROY, replaceable: false })],
  },
  {
    // Fight back: SACRIFICE a Hero card — the attacker gives one up (Mega
    // Slime's shape; declared here because nothing reads the printed
    // fight-back text on its own).
    trigger: { on: GameEventType.MonsterFoughtBack, scope: TriggerScope.Attacker },
    steps: [
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.Self }),
      new SacrificeTask(),
    ],
  },
]
