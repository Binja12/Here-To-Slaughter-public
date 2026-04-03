import { TimeControl, ActionFlow, TurnTimerMode } from 'shared'
import { ReactionWindow } from 'shared'
export const StandardTimeControl: TimeControl = {
  name: 'Standard',
  reactionCountdownMs: 5000,
  actionFlow: ActionFlow.WithReactions,
  // no timer = unlimited
}

export const FastTimeControl: TimeControl = {
  name: 'Fast',
  reactionCountdownMs: 3000,
  actionFlow: ActionFlow.WithReactions,
  turnTimerMode: TurnTimerMode.PerTurn,
  turnTimeMs: 60000, // 1 min per turn
  bonusTimeMs: 5000,
}

export const BlitzTimeControl: TimeControl = {
  name: 'Blitz',
  reactionCountdownMs: 2000,
  actionFlow: ActionFlow.WithReactions,
  turnTimerMode: TurnTimerMode.TotalTime,
  totalTimeMs: 900000, // 15 min total per player
  bonusTimeMs: 3000,
}
