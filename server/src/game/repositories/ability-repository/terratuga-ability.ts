import { GameEventType, PassiveType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'

// Terratuga (monster-130): "Your Hero cards cannot be destroyed."
//   Fight back (7 and under): SACRIFICE a Hero card — data, on the card.
//
//   [0] MonsterSlain on this card → install CantBeDestroyed on the slayer
//
// Warworn Owlbear's shape: a slain monster sits in the winner's party for the
// rest of the game, so the effect has no expiry — Mighty Blade is the same
// rule with a clock on it. Same reading as there: destroy only, never
// sacrifice, so Terratuga's own fight-back still bites its slayer's rivals.
export const TerratugaAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.MonsterSlain, scope: TriggerScope.SelfCard },
    steps: [new ApplyEffectTask({ type: PassiveType.CantBeDestroyed })],
  },
]
