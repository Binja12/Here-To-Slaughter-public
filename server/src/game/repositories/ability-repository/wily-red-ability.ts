import { GameEventType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { DrawTask } from '../../tasks/draw-task'

// Wily Red (hero-015): "Draw until you are holding seven cards."
//
//   [0] RollSuccess → draw until seven are held
//
// A negative count is the draw mechanic's "until you hold that many": a hand
// of seven or more draws nothing, a hand of two draws five, one CardDrawn
// each. Deck and discard both empty stops it short.
export const WilyRedAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [new DrawTask(-7)],
  },
]
