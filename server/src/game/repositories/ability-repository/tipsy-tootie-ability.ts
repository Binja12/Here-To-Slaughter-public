import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import { ChooseCardTask, ChoosePlayerTask } from '../../tasks/choose-tasks'
import { GiveHeroTask, StealFromPartyTask } from '../../tasks/hero-tasks'
import {
  CTX_CHOSEN_PLAYER,
  CTX_SOURCE_CARD,
  CTX_STOLEN_FROM_PLAYER,
} from '../../abilities/ability-context'

// Tipsy Tootie (hero-045): "Choose a player. STEAL a Hero card from that
// player's Party and move Tipsy Tootie to that player's Party."
//
//   [0] RollPassing → choose a player with heroes, while the roll still stands
//   [1] RollSuccess → choose one of their heroes → steal it → give THIS card to
//       the player it came from
//
// The give reads the hero from CTX_SOURCE_CARD — the context's own card, set
// at birth — and the recipient from CTX_STOLEN_FROM_PLAYER, which the steal
// recorded. Both directions go through the party's one choke point, so the
// gear travels each way and every membership expiry sees both moves.
export const TipsyTootieAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [
      new ChoosePlayerTask(
        { owner: Owner.Others, hasHeroes: true },
        'Choose a player to steal a hero from',
      ),
      new TargetRollTask(CTX_CHOSEN_PLAYER, Zone.Party),
    ],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask(
        { zone: Zone.Party, owner: Owner.Chosen },
        { question: 'Choose a hero to steal' },
      ),
      new StealFromPartyTask(),
      new GiveHeroTask(CTX_SOURCE_CARD, CTX_STOLEN_FROM_PLAYER),
    ],
  },
]
