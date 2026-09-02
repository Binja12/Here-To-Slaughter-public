import {
  GameEventType,
  Owner,
  PassiveType,
  TriggerScope,
  Zone,
} from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'
import { DrawTask } from '../../tasks/draw-task'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { SacrificeTask } from '../../tasks/hero-tasks'

// Mega Slime (monster-123)
//   Passive:      "You may spend an extra action point on each of your turns."
//   Slay 8+:      Slay this Monster card and DRAW 2 cards.
//   Fight back 7-: SACRIFICE a Hero card.
//
//   [0] MonsterSlain on this card   → draw the reward, install the passive
//   [1] MonsterFoughtBack, Attacker → the attacker gives up a hero
//
// [0] is MonsterSlain and not any earlier event because `slayMonster` puts the
// monster in the party BEFORE it announces: a monster still in the row has no
// owner to install anything on. The draw comes first, in printed order.
//
// The passive is an IEffect and not an entry that fires each turn, because the
// budget is settled inside TurnManager.startTurn before TurnStarted is even
// emitted — no pipeline exists at that moment to ask. No expiry: a monster
// never leaves a party, so nothing could end it.
//
// [1] is scoped Attacker, not SelfCard: the monster is still in the row and
// belongs to nobody, so the run is owned by whoever swung — and `ownerId` is
// what makes ChooseCardTask offer THEIR party and SacrificeTask take from it.
// One entry though it pauses: the choice window suspends the pipeline in place
// and the sacrifice is a later step of the same run (Critical Boost, §6).
const EXTRA_ACTION_POINTS = 1
const SLAY_REWARD_CARDS = 2

export const MegaSlimeAbility: IAbilityRule[] = [
  {
    trigger: {
      on: GameEventType.MonsterSlain,
      scope: TriggerScope.SelfCard,
    },
    steps: [
      new DrawTask(SLAY_REWARD_CARDS),
      new ApplyEffectTask({
        type: PassiveType.ActionPointBonus,
        value: EXTRA_ACTION_POINTS,
      }),
    ],
  },
  {
    trigger: {
      on: GameEventType.MonsterFoughtBack,
      scope: TriggerScope.Attacker,
    },
    steps: [
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.Self }),
      new SacrificeTask(),
    ],
  },
]
