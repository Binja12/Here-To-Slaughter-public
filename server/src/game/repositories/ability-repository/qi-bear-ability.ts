import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { DiscardTask } from '../../tasks/tasks'
import { DestroyTask } from '../../tasks/hero-tasks'
import { CTX_DISCARDED_CARDS } from '../../abilities/ability-context'

// Qi Bear (hero-007): "DISCARD up to 3 cards. For each card discarded,
// DESTROY a Hero card."
//
//   [0] RollSuccess → (choose a card of your hand → discard it → choose a
//       hero → destroy it) × 3
//
// "Up to" is the player picking nothing: DiscardTask then writes an empty
// CTX_DISCARDED_CARDS, the hero choice hangs on it (`requiresKey`) and skips,
// and so does every later round — each round's card choice hangs on the
// round before. Pay first, then destroy: a discard that buys nothing (no
// hero on the table) is still a discard, as printed.
const round = () => [
  new ChooseCardTask({ zone: Zone.Party, owner: Owner.All, destroyable: true }, CTX_DISCARDED_CARDS),
  new DestroyTask(),
]

export const QiBearAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Self }),
      new DiscardTask(),
      ...round(),
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Self }, CTX_DISCARDED_CARDS),
      new DiscardTask(),
      ...round(),
      new ChooseCardTask({ zone: Zone.Hand, owner: Owner.Self }, CTX_DISCARDED_CARDS),
      new DiscardTask(),
      ...round(),
    ],
  },
]
