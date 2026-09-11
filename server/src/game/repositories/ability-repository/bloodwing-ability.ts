import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { DiscardTask } from '../../tasks/tasks'
import { SacrificeTask } from '../../tasks/hero-tasks'

// Bloodwing (monster-127): "Each time another player CHALLENGES you, that
// player must DISCARD a card."
//   Fight back (6 and under): SACRIFICE a Hero card — data, on the card.
//
//   [0] ChallengePlayed aimed at one of my owner's cards, by somebody else
//       (TriggerScope.TargetsOwner) → the challenger picks a card of their
//       hand → the challenger discards it
//
// A slain monster is an ability source in its slayer's party, so this is
// live from the slay on. The scope hands the run the challenger as its
// chosen seat, which is what `executor: 'chosen'` reads on both steps.
export const BloodwingAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.ChallengePlayed, scope: TriggerScope.TargetsOwner },
    steps: [
      new ChooseCardTask(
        { zone: Zone.Hand, owner: Owner.Chosen, executor: 'chosen' },
        { question: 'Choose a card to discard' },
      ),
      new DiscardTask({ executor: 'chosen' }),
    ],
  },
  {
    // Fight back: SACRIFICE a Hero card — the attacker gives one up (Mega
    // Slime's shape; declared here because nothing reads the printed
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
