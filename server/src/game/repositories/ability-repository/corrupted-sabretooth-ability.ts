import { GameEventType, PassiveType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { ApplyEffectTask } from '../../tasks/tasks'

// Corrupted Sabretooth (monster-122): "Each time you would DESTROY a Hero
// card, you may STEAL that Hero card instead."
//   Fight back (6 and under): SACRIFICE a Hero card — data, on the card.
//
//   [0] MonsterSlain on this card → install StealsInsteadOfDestroy on the slayer
//
// A replacement effect: it does not run steps of its own, it changes what a
// step of the slayer's DOES. DestroyTask reads it at the moment of the
// destroy — a hero of another party that the effect's owner would destroy is
// stolen instead, through StealFromPartyTask, so the theft announces itself
// and honours CantBeStolen. Warworn Owlbear's shape: a slain monster sits in
// the winner's party for good, so no expiry.
//
// The printed "may" is not asked yet: the steal always happens. A yes/no in
// the middle of a destroy would need the step to suspend; noted in the
// backlog as an approximation.
export const CorruptedSabretoothAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.MonsterSlain, scope: TriggerScope.SelfCard },
    steps: [new ApplyEffectTask({ type: PassiveType.StealsInsteadOfDestroy })],
  },
]
