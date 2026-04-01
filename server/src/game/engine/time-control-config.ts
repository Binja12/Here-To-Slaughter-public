export const StandardTimeControl: TimeControl = {
  name: 'Standard',
  reactionCountdownMs: 5000,
  turnTimeMs: undefined,
  bonusTimeMs: undefined,
  actionFlow: ActionFlow.WithReactions,
}

export const FastTimeControl: TimeControl = {
  name: 'Fast',
  reactionCountdownMs: 3000,
  turnTimeMs: 60000,
  bonusTimeMs: 5000,
  actionFlow: ActionFlow.WithReactions,
}

export const InstantTimeControl: TimeControl = {
  name: 'Instant',
  reactionCountdownMs: 0,
  turnTimeMs: undefined,
  bonusTimeMs: undefined,
  actionFlow: ActionFlow.Instant, // no reactions at all
}
