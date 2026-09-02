import { GameEventType, TriggerScope } from 'shared'
import { ISystemRule } from '../../interfaces'
import { DisposeInstanceCardTask } from '../../tasks/magic-tasks'

// ---------------------------------------------------------------------------
// The rule every card sitting in an instance pile has, printed on none of them:
// when its run is over, it goes to the discard.
//
// `AbilityDone` is emitted by TaskManager when the last pipeline sourced to a
// card leaves the stack. System rules neither raise it nor delay it, so this
// rule finishing does not re-trigger itself.
// ---------------------------------------------------------------------------

export const instanceRules: ISystemRule[] = [
  {
    trigger: { on: GameEventType.AbilityDone, scope: TriggerScope.SelfCard },
    // Acts on the entry's own source card, so it needs no slot.
    steps: [new DisposeInstanceCardTask()],
  },
]
