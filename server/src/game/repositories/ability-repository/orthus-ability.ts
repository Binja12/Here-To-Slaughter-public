import { CardType, GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { CTX_DRAWN_CARD_IDS } from '../../abilities/ability-context'
import { CardTypeCondition } from '../../tasks/conditions'
import { ChooseCardTask, ConfirmTask } from '../../tasks/choose-tasks'
import { DiscardTask } from '../../tasks/tasks'
import { PlayMagicTask } from '../../tasks/magic-tasks'

// Orthus (monster-131)
//   Passive:       "Each time you DRAW a Magic card, you may play it
//                   immediately."
//   Slay 8+:       SLAY this Monster card.
//   Fight back 4-: DISCARD 2 cards.
//
//   [0] CardDrawn, OwnerEvent            → was it Magic?
//   [1] ConditionMet 'OrthusDrewMagic'   → ask
//   [2] TaskConfirmed 'OrthusPlaysMagic' → play it
//   [3] MonsterFoughtBack, Attacker      → the attacker discards two
//
// Snowball's shape (§6) with the DRAW taken out: Snowball draws for itself and
// fills CTX_DRAWN_CARD_IDS from its own step, while this reacts to a draw made
// by anything at all — an action, another card — and reads the slot off the
// event's ctxSeed. That seed is the whole reason this card can work.
//
// The passive needs no MonsterSlain entry to install: a live TRIGGER is not an
// effect, and entries are re-derived from the monster's position on every event
// (§7), so sitting in the party is the whole of what keeps it running.
//
// OwnerEvent and not SelfCard: CardDrawn is about the CARD drawn, not about the
// monster, so payload.cardId is never this monster's id.

const DREW_A_MAGIC = 'OrthusDrewMagic'
const PLAY_IT = 'OrthusPlaysMagic'

export const OrthusAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.CardDrawn, scope: TriggerScope.OwnerEvent },
    steps: [
      new CardTypeCondition(CardType.Magic, CTX_DRAWN_CARD_IDS, DREW_A_MAGIC),
    ],
  },
  {
    trigger: {
      on: GameEventType.ConditionMet,
      scope: TriggerScope.SelfCard,
      when: DREW_A_MAGIC,
    },
    steps: [
      new ConfirmTask({
        confirms: PLAY_IT,
        question: 'Play the magic card you just drew?',
        subjectKey: CTX_DRAWN_CARD_IDS,
      }),
    ],
  },
  {
    trigger: {
      on: GameEventType.TaskConfirmed,
      scope: TriggerScope.SelfCard,
      when: PLAY_IT,
    },
    steps: [new PlayMagicTask(CTX_DRAWN_CARD_IDS)],
  },
  {
    trigger: {
      on: GameEventType.MonsterFoughtBack,
      scope: TriggerScope.Attacker,
    },
    steps: [
      new ChooseCardTask(
        { zone: Zone.Hand, owner: Owner.Self },
        { question: 'Choose the first card to discard' },
      ),
      new DiscardTask(),
      new ChooseCardTask(
        { zone: Zone.Hand, owner: Owner.Self },
        { question: 'Choose the second card to discard' },
      ),
      new DiscardTask(),
    ],
  },
]
