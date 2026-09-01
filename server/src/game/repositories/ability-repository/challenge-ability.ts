import { GameEventType, TriggerScope } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { StartChallengeTask } from '../../tasks/challenge-tasks'

// Challenge (challenge-102 … challenge-115): "Reaction: when an opponent plays a hero, item or magic card, contest it with a roll-off."
//
//   [0] ChallengePlayed on this card → contest the play
//
// ONE declaration for all 14 printed copies: they are identical, and the card
// that was challenged is the one the open window is already about.
//
// The window fights the challenge and settles it; this only starts it. Which
// player is challenging is `ctx.ownerId` — the card is in its own owner's
// instance pile, and that is where this entry was matched from.
export const ChallengeAbility: IAbilityRule[] = [
  {
    trigger: {
      on: GameEventType.ChallengePlayed,
      scope: TriggerScope.SelfCard,
    },
    steps: [new StartChallengeTask()],
  },
]
