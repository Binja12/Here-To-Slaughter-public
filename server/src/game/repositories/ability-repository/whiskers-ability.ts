import { GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { TargetRollTask } from '../../tasks/target-roll-task'
import { CTX_CHOSEN_CARD } from '../../abilities/ability-context'
import { ChooseCardTask } from '../../tasks/choose-tasks'
import { DestroyTask, StealFromPartyTask } from '../../tasks/hero-tasks'

/** Whiskers' second victim. Its own slot, so both survive to RollSuccess. */
const CTX_DESTROYED_HERO = 'whiskers.destroyedHero'

// Whiskers (hero-037): "Steal one hero, then destroy one hero."
//
// TWO independent victims, and they may sit in different parties — so both are
// named while the roll's window is still open (the owner, 2026-09-08, the same
// correction Fluffy needed). Each choice suspends the window, which clears the
// passes and restarts the reaction clock, so every seat named gets to see it
// and answer it. Only when the roll finally lands do the steal and the destroy
// happen.
//
// The destroy MAY name the hero being stolen — the card says "Steal one hero,
// then destroy one hero", not two different ones, and by the time the
// destroy runs the stolen hero is in this party. Fluffy excludes its first
// pick because "Destroy two heroes" is two cards; this is not.
export const WhiskersAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.RollPassing, scope: TriggerScope.SelfCard },
    steps: [
      new ChooseCardTask(
        { zone: Zone.Party, owner: Owner.Others },
        { question: 'Choose a hero to steal' },
      ),
      new TargetRollTask(CTX_CHOSEN_CARD, Zone.Party),
      new ChooseCardTask(
        { zone: Zone.Party, owner: Owner.All, destroyable: true },
        { resultKey: CTX_DESTROYED_HERO, question: 'Choose a hero to destroy' },
      ),
      new TargetRollTask(CTX_DESTROYED_HERO, Zone.Party),
    ],
  },
  {
    trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
    steps: [new StealFromPartyTask(), new DestroyTask(CTX_DESTROYED_HERO)],
  },
]
