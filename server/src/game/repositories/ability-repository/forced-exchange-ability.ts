import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { CTX_STOLEN_FROM_PLAYER } from '../../abilities/ability-context'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { StealFromPartyTask, GiveHeroTask } from '../../tasks/hero-tasks'

// Forced Exchange (magic-057): "Choose a player. STEAL a Hero card from that
// player's Party, then move a Hero card from your Party to that player's
// Party."
//
//   [0] FrameResolved on this card → take one from any other party, hand one back
//
// The printed text opens with "Choose a player", but pointing at a hero NAMES
// its player: `getCardOwner` settles the seat, so the reachable (hero taken,
// seat handed back to) pairs are the same either way. The seat is therefore
// chosen by the same press that chooses the hero, and this card runs the
// engine's ONE steal shape — the two lines Entangling Trap, Kit Napper,
// Whiskers and Wiggles already declare (the owner, 2026-09-07).
//
// BOTH remaining steps hang off CTX_STOLEN_FROM_PLAYER, and that is what makes
// the second clause conditional on the first — the prompt as well as the move,
// so a refused steal asks nothing and does nothing. When the steal did not
// happen — nobody fielding a hero, or one protected by CantBeStolen — it
// leaves the slot EMPTY and GiveHeroTask skips itself on its own missing
// input. No condition, no second entry, no step asking about a sibling: "you
// may give" is only reachable through "you stole" because the give's input is
// the steal's output (§2).
//
// TWO windows, one entry. Each choice suspends the pipeline in place and wakes
// it with its slot filled, so every acting step sits directly behind the
// choice that feeds it — CTX_CHOSEN_CARD is overwritten by the second pick,
// which is why the steal has to happen before it.
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
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.Others }),
      new StealFromPartyTask(),
      new ChooseCardTask(
        { zone: Zone.Party, owner: Owner.Self },
        CTX_STOLEN_FROM_PLAYER,
      ),
      new GiveHeroTask(undefined, CTX_STOLEN_FROM_PLAYER),
    ],
  },
]
