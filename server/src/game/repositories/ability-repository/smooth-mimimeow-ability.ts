import { GameEventType, HeroClass, Owner, TriggerScope } from 'shared'
import { PullCardTask } from '../../tasks/tasks'
import { IAbilityRule } from '../../interfaces'

// Smooth Mimimeow (hero-024): "Pull a card from the hand of each other player with a Thief in their Party."
//
//   [0] RollSuccess → one blind pull from every other seat with a Thief
//
// Nobody is asked anything — a pull is blind — so no frame and no loop:
// PullCardTask takes the seats from a filter and pulls once from each.
export const SmoothMimimeowAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [new PullCardTask({ from: { owner: Owner.Others, hasClass: HeroClass.Thief } })],
  },
]
