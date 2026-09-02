import { GameEventType, PassiveType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'
import { untilUnequipped } from '../../abilities/expiries'

// Sealing Key (item-076): "You cannot use the equipped Hero card's effect."
//
//   [0] FrameResolved on this card → install the seal
//
// A prohibition rather than a number, and the first `Cant*` passive scoped to a
// CARD rather than to a player. scopedToCarrier is what does that: the effect
// names the hero the key is riding, so a player with two heroes keeps the other
// one usable.
//
// Read by both halves of rolling on a hero — the action refuses in canExecute
// before the point is spent, the task refuses when it discovers its target.
// GameState.canUseHeroEffect holds the question so neither holds a copy.
//
// The universal roll OFFER in hero-rules.ts never has to know about this. It
// fires on FrameResolved naming the HERO, which only a hero's own play produces
// — and a hero cannot already be wearing a key at the moment it is played, so
// there is no sealed hero to offer a roll to. This item's own settled frame
// names the ITEM, so it does not match that entry either.
//
// CURSED, so it is played onto an opponent's hero and seals THEIRS.

export const SealingKeyAbility: IAbilityRule[] = [
  {
    trigger: {
      on: GameEventType.ItemEquippedToHero,
      scope: TriggerScope.SelfCard,
    },
    steps: [
      new ApplyEffectTask({
        type: PassiveType.CantUseHeroEffect,
        scopedToCarrier: true,
        expiry: untilUnequipped,
      }),
    ],
  },
]
