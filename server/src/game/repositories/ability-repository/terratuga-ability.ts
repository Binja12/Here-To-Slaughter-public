import { GameEventType, PassiveType, TriggerScope, Owner, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { SacrificeTask } from '../../tasks/hero-tasks'

// Terratuga (monster-130): "Your heroes cannot be destroyed."
//   Fight back (7 and under): Sacrifice one of your heroes — entry [1].
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
  {
    // Fight back: Sacrifice one of your heroes — the attacker gives one up
    // (Mega Slime's shape; declared here because nothing reads the printed
    // fight-back text on its own).
    trigger: { on: GameEventType.MonsterFoughtBack, scope: TriggerScope.Attacker },
    steps: [
      new ChooseCardTask(
        { zone: Zone.Party, owner: Owner.Self },
        { question: 'Choose a hero to sacrifice' },
      ),
      new SacrificeTask(),
    ],
  },
]
