import { CardType, GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { PlayItemTask } from '../../tasks/item-tasks'
import { DrawTask } from '../../tasks/draw-task'
import { CTX_CHOSEN_ITEM } from '../../abilities/ability-context'

// Hook (hero-013): "Play an Item card from your hand immediately and DRAW a
// card."
//
//   [0] RollSuccess → choose an Item of your hand (→ CTX_CHOSEN_ITEM) →
//       choose an empty-handed hero of yours (→ the default slot) → play the
//       item onto it → draw
//
// Two picks, so the first lands in its own slot (`resultKey`) and the second
// takes the default; PlayItemTask reads both. No item in hand, or no hero to
// wear one, and the play skips; the draw is printed without an "if", so it
// happens either way. The play opens a challenge window like any other, and
// the draw waits for it.
export const HookAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask(
        { zone: Zone.Hand, owner: Owner.Self, cardType: CardType.Item },
        { resultKey: CTX_CHOSEN_ITEM },
      ),
      new ChooseCardTask(
        { zone: Zone.Party, owner: Owner.Self, unequipped: true },
        { requiresKey: CTX_CHOSEN_ITEM },
      ),
      new PlayItemTask(CTX_CHOSEN_ITEM),
      new DrawTask(1),
    ],
  },
]
