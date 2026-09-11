import { GameEventType, PassiveType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'
import { untilOwnersNextTurn } from '../../abilities/expiries'

// Mighty Blade (hero-031): "Your heroes cannot be destroyed until your next
// turn begins."
//
//   [0] RollSuccess on this card → install CantBeDestroyed on the owner
//
// No `cardId`: the wording covers every hero the owner fields, the ones that
// arrive later included, so the rule is read against the OWNER at the moment
// a destroy is attempted (`GameState.canBeDestroyed`), never pinned to the
// heroes standing there when it was rolled. Sacrifice is not covered — a
// fight-back still costs a hero — because the card says "destroyed", and the
// engine keeps the two reasons apart on purpose (hero-tasks.ts).
export const MightyBladeAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ApplyEffectTask({
        type: PassiveType.CantBeDestroyed,
        expiry: untilOwnersNextTurn,
      }),
    ],
  },
]
