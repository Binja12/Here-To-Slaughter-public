import {
  CardType,
  GameEventType,
  Owner,
  PassiveType,
  TriggerScope,
  Zone,
} from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask, DiscardTask } from '../../tasks/tasks'
import { ChooseCardTask } from '../../tasks/choose-tasks'

// Warworn Owlbear (monster-135)
//   Passive:       "Items you play cannot be challenged."
//   Slay 8+:       On slaying: no extra reward.
//   Fight back 4-: Discard two cards.
//
//   [0] MonsterSlain on this card   → install the protection
//   [1] MonsterFoughtBack, Attacker → the attacker discards two
//
// [0] uses MonsterSlain for the reason Mega Slime does: the monster is in the
// party before the announcement, and one still in the row has no owner.
//
// `cardTypes` is what makes it Items and not everything — the third narrowing
// on an IEffect, and the only one about a card being PLAYED rather than a roll.
// GameState.canBeChallenged reads it; ChallengeWindow asks at construction and
// runs a 0ms clock when the answer is no. The frame still opens and settles, so
// the item's own entry fires off it as always (§1) — what the protection takes
// away is the time anyone had to answer. No expiry: monster passives are
// permanent.
//
// [1] is two choose/discard PAIRS rather than one step discarding two, because
// each card is its own decision and a choice window settles one pick. The
// entry pauses twice and resumes in place both times; the second choice
// overwrites CTX_CHOSEN_CARD, which is why each discard sits directly behind
// its own choice.
//
// Scoped Attacker: the monster is still in the row and belongs to nobody, so
// the run is owned by whoever swung, and Owner.Self resolves to their hand.

export const WarwornOwlbearAbility: IAbilityRule[] = [
  {
    trigger: {
      on: GameEventType.MonsterSlain,
      scope: TriggerScope.SelfCard,
    },
    steps: [
      new ApplyEffectTask({
        type: PassiveType.CantBeChallenged,
        cardTypes: [CardType.Item],
      }),
    ],
  },
  {
    trigger: {
      on: GameEventType.MonsterFoughtBack,
      scope: TriggerScope.Attacker,
    },
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
    ],
  },
]
