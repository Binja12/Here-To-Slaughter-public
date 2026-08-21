import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ChoosePlayerTask, ChooseCardTask } from '../../tasks/choose-tasks'
import { StealFromPartyTask, GiveHeroTask } from '../../tasks/hero-tasks'

// Forced Exchange (magic-057): "Choose a player. STEAL a Hero card from that
// player's Party, then move a Hero card from your Party to that player's
// Party."
//
//   [0] FrameResolved on this card → pick a player, take one, hand one back
//
// The reference for Owner.Chosen, and the only card that needs it. The filter
// on the second step cannot name a party when it is built — abilities are
// declared at module load, before a game exists — so it names the CHOICE
// instead: Owner.Chosen reads CTX_CHOSEN_PLAYER, which the step ahead wrote.
//
// THREE windows, one entry. Each choice suspends the pipeline in place and
// wakes it with its slot filled, so every acting step sits directly behind the
// choice that feeds it — CTX_CHOSEN_CARD is overwritten by the second pick,
// which is why the steal has to happen before it.
//
// CTX_CHOSEN_PLAYER survives all of that: only a player choice writes it, and
// there is only one. That is what lets the give at the end still know who the
// exchange is with.
//
// Gear travels both ways without a word here: Party.removeHero returns what a
// hero was wearing and addHero puts it back on in the new party.
//
// Nothing here puts the spell away: instance-rules.ts does, on AbilityDone.
export const ForcedExchangeAbility: IAbilityRule[] = [
  {
    trigger: {
      on: GameEventType.FrameResolved,
      scope: TriggerScope.SelfCard,
    },
    steps: [
      new ChoosePlayerTask({ owner: Owner.Others }),
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.Chosen }),
      new StealFromPartyTask(),
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.Self }),
      new GiveHeroTask(),
    ],
  },
]
