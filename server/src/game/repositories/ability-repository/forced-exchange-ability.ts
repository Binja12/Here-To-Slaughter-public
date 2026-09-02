import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { CTX_STOLEN_FROM_PLAYER } from '../../abilities/ability-context'
import { ChoosePlayerTask, ChooseCardTask } from '../../tasks/choose-tasks'
import { StealFromPartyTask, GiveHeroTask } from '../../tasks/hero-tasks'

// Forced Exchange (magic-057): "Choose a player. STEAL a Hero card from that
// player's Party, then move a Hero card from your Party to that player's
// Party."
//
//   [0] FrameResolved on this card → pick a player, take one, hand one back
//
// The reference for Owner.Chosen. The filter on the second step cannot name a
// party when it is built — abilities are declared at module load, before a game
// exists — so it names the CHOICE instead: Owner.Chosen reads CTX_CHOSEN_PLAYER,
// which the step ahead wrote.
//
// `hasHeroes` on the player choice, because BOTH clauses are about that
// player's party: a seat with nobody in it is a choice that cannot be carried
// out, so it is never offered.
//
// BOTH remaining steps hang off CTX_STOLEN_FROM_PLAYER rather than
// CTX_CHOSEN_PLAYER, and that is what makes the second clause conditional on
// the first — the prompt as well as the move, so a refused steal asks nothing
// and does nothing. The two slots hold the
// same player whenever the steal worked; when it did not — a hero protected by
// CantBeStolen — the steal leaves it EMPTY and GiveHeroTask skips itself on its
// own missing input. No condition, no second entry, no step asking about a
// sibling: "you may give" is only reachable through "you stole" because the
// give's input is the steal's output (§2).
//
// THREE windows, one entry. Each choice suspends the pipeline in place and
// wakes it with its slot filled, so every acting step sits directly behind the
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
      new ChoosePlayerTask({ owner: Owner.Others, hasHeroes: true }),
      new ChooseCardTask({ zone: Zone.Party, owner: Owner.Chosen }),
      new StealFromPartyTask(),
      new ChooseCardTask(
        { zone: Zone.Party, owner: Owner.Self },
        CTX_STOLEN_FROM_PLAYER,
      ),
      new GiveHeroTask(undefined, CTX_STOLEN_FROM_PLAYER),
    ],
  },
]
