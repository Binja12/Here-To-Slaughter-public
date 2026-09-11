import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import { CTX_CHOSEN_PLAYER } from '../../abilities/ability-context'
import { ChoosePlayerTask } from '../../tasks/choose-tasks'
import { RevealTask } from '../../tasks/tasks'

// Sharp Fox (hero-016): "Look at another player's hand."
//
//   [0] RollPassing → choose a player, while the roll still stands
//   [1] RollSuccess → their hand is shown to me for a while
//
// A look and nothing else: RevealTask puts that hand on MY view's
// `revealedCards` (nobody else's), announces CardsRevealed, and takes it off
// again when the reveal clock runs out. No window — nothing is being asked,
// so the table is not held.
export const SharpFoxAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [new ChoosePlayerTask({ owner: Owner.Others }, 'Choose a player to look at their hand'), new TargetRollTask(CTX_CHOSEN_PLAYER, Zone.Hand)],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new RevealTask({ filter: { zone: Zone.Hand, owner: Owner.Chosen }, to: 'owner' }),
    ],
  },
]
