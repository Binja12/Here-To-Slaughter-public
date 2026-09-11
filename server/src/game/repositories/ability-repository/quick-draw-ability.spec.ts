import {
  CardType,
  GameEventType,
  HeroClass,
  ReactionWindowType,
  TriggerScope,
} from 'shared'
import { HeroCard } from '../../cards/hero-card'
import { ItemCard } from '../../cards/item-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { GameEventFactory } from '../../events/game-event-factory'
import { IReactionWindow } from '../../interfaces'
import { GameState } from '../../pipelines/game-state'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { CONFIRM } from '../../reactions/task-choice-window'
import { CardPile } from '../../state-structures/card-pile'
import { CardStack } from '../../state-structures/card-stack'
import { Party } from '../../state-structures/party'
import { Player } from '../../state-structures/player'
import { expectAbility } from './ability-declaration-test-helpers'
import { QuickDrawAbility } from './quick-draw-ability'

const hero = (id: string) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'base',
    heroClass: HeroClass.Thief,
    rollReq: 5,
  })

const item = (id: string) =>
  new ItemCard({
    id,
    name: id,
    type: CardType.Item,
    image: '',
    description: '',
    set: 'base',
    cursed: false,
  })

const openWindow = (gs: GameState): IReactionWindow =>
  gs.openWindows().find((window) => window.isOpen())!

describe('QuickDrawAbility', () => {
  it('registers the Snowball-shaped Item flow', () => {
    expectAbility('hero-010', QuickDrawAbility, [
      {
        on: GameEventType.RollSuccess,
        scope: TriggerScope.SelfCard,
        steps: ['DrawTask', 'CardTypeCondition'],
      },
      {
        on: GameEventType.ConditionMet,
        scope: TriggerScope.SelfCard,
        when: 'QuickDrawDrewItem',
        steps: ['ConfirmTask'],
      },
      {
        on: GameEventType.TaskConfirmed,
        scope: TriggerScope.SelfCard,
        when: 'QuickDrawPlaysItem',
        steps: ['ChooseCardTask', 'ChooseCardTask', 'PlayItemTask'],
      },
    ])
  })

  it('offers only drawn Items, then plays the chosen one immediately', () => {
    const deck = new CardStack('deck', 'main')
    deck.addToBottom('drawn-hero')
    deck.addToBottom('drawn-item')
    const gs = new GameState(
      deck,
      new CardPile('discard', 'discard'),
      new CardStack('monster-deck', 'monster-deck'),
      new CardPile('monster-pile', 'monster-pile'),
    )
    gs.registerPlayer(
      new Player({
        id: 'p1',
        name: 'p1',
        hand: ['old-item'],
        partyId: 'p1-party',
        actionPoints: 3,
      }),
    )
    gs.registerParty(
      new Party({
        playerId: 'p1',
        leaderId: 'p1-leader',
        heroIds: ['hero-010', 'wearer'],
        monsterIds: [],
      }),
    )
    for (const id of ['hero-010', 'wearer', 'drawn-hero']) {
      gs.registerCard(hero(id))
    }
    gs.registerCard(item('old-item'))
    gs.registerCard(item('drawn-item'))

    const emitter = new GameEventEmitter()
    const reactions = new ReactionManager(gs, emitter)
    new TaskManager(
      gs,
      emitter,
      reactions,
      new Map([['hero-010', QuickDrawAbility]]),
    )

    emitter.emit(GameEventFactory.rollSuccess('p1', 'hero-010'))

    // The ask NAMES the Item, not whatever came off the deck first: the board
    // glows the card the question is about, and a Hero (or a Challenge, or a
    // Modifier) is not a card this offer can be taken on.
    const ask = openWindow(gs)
    expect(ask.getType()).toBe(ReactionWindowType.TaskChoice)
    expect(ask.getDetail()['cardId']).toBe('drawn-item')
    ask.submitReaction('p1', { choice: CONFIRM })

    const itemChoice = openWindow(gs)
    expect(itemChoice.getType()).toBe(ReactionWindowType.CardChoice)
    expect(itemChoice.getOptions()).toEqual(['drawn-item'])
    itemChoice.submitReaction('p1', { choice: 'drawn-item' })

    const heroChoice = openWindow(gs)
    expect(heroChoice.getOptions()).toEqual(['hero-010', 'wearer'])
    heroChoice.submitReaction('p1', { choice: 'wearer' })

    expect(gs.getEquippedItem('wearer')).toBe('drawn-item')
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['old-item', 'drawn-hero'])
    expect(openWindow(gs).getType()).toBe(ReactionWindowType.Challenge)
    openWindow(gs).resolve()
  })
})
