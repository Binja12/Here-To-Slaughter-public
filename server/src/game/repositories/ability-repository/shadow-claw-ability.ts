import { GameEventType, Owner, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { PullCardTask } from '../../tasks/tasks'
import { ChoosePlayerTask } from '../../tasks/choose-tasks'

// The Shadow Claw (leader-117): "Once per turn on your turn, you may spend an
// action point to pull a card from another player's hand."
//
//   [0] LeaderActivated on the leader → choose whose hand, take one at random
//
// The only ACTIVATED card in the registry, and it declares none of what makes
// it one: "once per turn", "on your turn" and "spend an action point" are all
// RollOnLeaderAction's guards. The declaration is only what happens next,
// which is why it reads like any hero's.
//
// SelfCard on LeaderActivated: the action announces the leader's own id, so this
// matches the same way a hero's ability matches its own successful roll. No
// dice were thrown — there is nothing for a leader to beat — and the event is
// the leader's own, so a "when you roll" rule never mistakes it for a roll.
//
// ONE entry, though it pauses: the player choice suspends the pipeline in place
// and FrameResolved wakes it with CTX_CHOSEN_PLAYER filled, so the pull is a
// later STEP of the same run (Critical Boost is the reference).
//
// The pull is RANDOM, which is what "pull" means against a hand you cannot see.
export const ShadowClawAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.LeaderActivated, scope: TriggerScope.SelfCard },
    steps: [new ChoosePlayerTask({ owner: Owner.Others }, 'Choose a player to pull a card from'), new PullCardTask()],
  },
]
