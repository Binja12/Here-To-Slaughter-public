import { CardType, GameEventType, Owner, TriggerScope, Zone } from 'shared'
import { IAbilityRule } from '../../interfaces'
import { CTX_DRAWN_CARD_IDS } from '../../abilities/ability-context'
import { CardTypeCondition } from '../../tasks/conditions'
import { ChooseCardTask, ConfirmTask } from '../../tasks/choose-tasks'
import { DiscardTask } from '../../tasks/tasks'
import { PlayItemTask } from '../../tasks/item-tasks'

// Malamammoth (monster-134)
//   Passive:       "Each time you DRAW an Item card, you may play it
//                   immediately."
//   Slay 8+:       SLAY this Monster card.
//   Fight back 4-: DISCARD 2 cards.
//
//   [0] CardDrawn, OwnerEvent                 → was it an Item?
//   [1] ConditionMet 'MalamammothDrewItem'    → ask
//   [2] TaskConfirmed 'MalamammothPlaysItem'  → pick a hero, equip it
//   [3] MonsterFoughtBack, Attacker           → the attacker discards two
//
// Orthus's shape with one extra step, and that step is the whole difference
// between the two: an Item needs somewhere to GO. `unequipped` is what makes
// the choice offer only heroes that can actually take it — a hero already
// carrying an item would be refused by canEquip after the player picked it.
//
// A party with no legal hero therefore offers NOTHING, the window settles on
// its 0ms empty-choice timer, and PlayItemTask reads the empty slot and skips.
// The item stays in hand and the turn carries on; no branch says so anywhere,
// which is the empty-slot convention doing the work (§2).

const DREW_AN_ITEM = 'MalamammothDrewItem'
const PLAY_IT = 'MalamammothPlaysItem'

export const MalamammothAbility: IAbilityRule[] = [
  {
    trigger: { on: GameEventType.CardDrawn, scope: TriggerScope.OwnerEvent },
    steps: [
      new CardTypeCondition(CardType.Item, CTX_DRAWN_CARD_IDS, DREW_AN_ITEM),
    ],
  },
  {
    trigger: {
      on: GameEventType.ConditionMet,
      scope: TriggerScope.SelfCard,
      when: DREW_AN_ITEM,
    },
    steps: [
      new ConfirmTask({
        confirms: PLAY_IT,
        question: 'Play the item you just drew?',
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
    steps: [
      new ChooseCardTask(
        {
          zone: Zone.Party,
          owner: Owner.Self,
          unequipped: true,
        },
        { question: 'Choose a hero to equip it to' },
      ),
      new PlayItemTask(CTX_DRAWN_CARD_IDS),
    ],
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
