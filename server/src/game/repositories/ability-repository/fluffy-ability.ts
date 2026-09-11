import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import { CTX_CHOSEN_CARD } from '../../abilities/ability-context'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { DestroyTask } from '../../tasks/hero-tasks'

/** Fluffy's second victim. Its own slot, so both survive to RollSuccess. */
const CTX_SECOND_HERO = 'fluffy.secondHero'

// Fluffy (hero-038): "Destroy two heroes."
//
// BOTH heroes are chosen while the roll's window is still open (the owner,
// 2026-09-08): each choice suspends the window, which clears the passes and
// restarts the reaction clock, so the table gets a fresh look at a roll whose
// targets it can still answer. Only when the window finally settles does
// RollSuccess destroy them — one DestroyTask per slot.
//
// Choosing second must not offer the first again: `excludeKey` drops whatever
// the first choice wrote.
export const FluffyAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask(
        { zone: Zone.Party, owner: Owner.All, destroyable: true },
        { question: 'Choose the first hero to destroy' },
      ),
      new TargetRollTask(CTX_CHOSEN_CARD, Zone.Party),
      new ChooseCardTask(
        {
          zone: Zone.Party,
          owner: Owner.All,
          destroyable: true,
          excludeKey: CTX_CHOSEN_CARD,
        },
        { resultKey: CTX_SECOND_HERO, question: 'Choose the second hero to destroy' },
      ),
      new TargetRollTask(CTX_SECOND_HERO, Zone.Party),
    ],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [new DestroyTask(), new DestroyTask(CTX_SECOND_HERO)],
  },
]
