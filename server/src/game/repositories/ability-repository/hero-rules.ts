import { GameEventType, TriggerScope } from 'shared'
import { ISystemRule } from '../../interfaces'
import { ConfirmTask } from '../../tasks/choose-tasks'
import { RollOnHeroTask } from '../../tasks/roll-on-hero-task'

// ---------------------------------------------------------------------------
// The entries every hero in a party has, printed on none of them. TaskManager
// pushes these alongside whatever the registry holds for the card.
//
//   [0] FrameResolved on this hero → ask whether to roll
//   [1] TaskConfirmed 'RollOnPlayedHero' → roll on it
//
// Split at the question: a confirm is always the last step of its entry (§6),
// and DISMISS emits no event, so entry [1] simply never fires.
//
// FrameResolved carries a cardId only from a settled CHALLENGE, and the only
// challenges opened on a hero are PlayHeroAction and PlayHeroTask. A hero that
// lost its challenge is out of the party before the event, so it is not among
// the sources and is never offered a roll.
// ---------------------------------------------------------------------------

/** Matched by entry [1]'s `when`, and shown to the player by the client. */
export const OFFERS_ROLL = 'RollOnPlayedHero'

export const heroRules: ISystemRule[] = [
  {
    trigger: { on: GameEventType.FrameResolved, scope: TriggerScope.SelfCard },
    // No subjectKey: the subject is the entry's own source card.
    steps: [new ConfirmTask({ confirms: OFFERS_ROLL })],
  },
  {
    trigger: {
      on: GameEventType.TaskConfirmed,
      scope: TriggerScope.SelfCard,
      when: OFFERS_ROLL,
    },
    // No slot to read: the hero to roll on is the entry's own source card.
    steps: [new RollOnHeroTask()],
  },
]
