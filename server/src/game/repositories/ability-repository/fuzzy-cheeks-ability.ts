import { CardType, GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { DrawTask } from '../../tasks/draw-task'
import { PlayHeroTask } from '../../tasks/play-hero-task'

// Fuzzy Cheeks (hero-043): "DRAW a card and play a Hero card from your hand
// immediately."
export const FuzzyCheeksAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new DrawTask(1),
      new ChooseCardTask({
        zone: Zone.Hand,
        owner: Owner.Self,
        cardType: CardType.Hero,
      }),
      new PlayHeroTask(),
    ],
  },
]
