import {
  GameEventType,
  Owner,
  PassiveType,
  TriggerScope,
  Zone,
} from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { SacrificeTask } from '../../tasks/hero-tasks'

// Abyss Queen (monster-129)
//   Passive:       "Each time another player plays a Modifier card on one of
//                   your rolls, +1 to your roll."
//   Slay 8+:       SLAY this Monster card.
//   Fight back 5-: SACRIFICE a Hero card.
//
//   [0] MonsterSlain on this card   → install the standing answer
//   [1] MonsterFoughtBack, Attacker → the attacker gives up a hero
//
// An IEffect and not an entry triggered on ModifierPlayed, because the +1 has
// to arrive INSIDE a window that is already open and no pipeline is running at
// the moment a bonus lands (§7). The windows a modifier can be spent into read
// it — ModifiableRollWindow for a plain roll or an attack, ChallengeWindow for
// either side of a contest — and each pushes it as its own sourced entry, so
// the roll UI can name where the number came from.
//
// "ANOTHER player" is the readers' `playerId !== target` check. Nothing here
// says it, because a trigger scope cannot: the effect has no trigger at all.

const COUNTER_BONUS = 1

export const AbyssQueenAbility: IAbilityRule[] = [
  {
    trigger: {
      on: GameEventType.MonsterSlain,
      scope: TriggerScope.SelfCard,
    },
    steps: [
      new ApplyEffectTask({
        type: PassiveType.ModifierCounterBonus,
        value: COUNTER_BONUS,
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
        { zone: Zone.Party, owner: Owner.Self },
        { question: 'Choose a hero to sacrifice' },
      ),
      new SacrificeTask(),
    ],
  },
]
