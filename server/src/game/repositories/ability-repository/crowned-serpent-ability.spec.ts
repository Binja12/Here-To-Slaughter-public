import { CardType, GameEventType, HeroClass, IGameEvent, ReactionWindowType } from 'shared'
import { GameState } from '../../pipelines/game-state'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { HeroCard } from '../../cards/hero-card'
import { ItemCard } from '../../cards/item-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { AbilityContext, CTX_CHOSEN_CARD, CTX_CHOSEN_PLAYER } from '../../abilities/ability-context'
import { IReactionWindow } from '../../interfaces'

const makeGs = (deck: string[] = []) => {
  const main = new CardStack('deck', 'main')
  for (const id of deck) main.addToBottom(id)
  return new GameState(main, new CardPile('discard', 'discard'), new CardStack('mdeck', 'monster-deck'), new CardPile('mpile', 'monster-pile'))
}

const seat = (gs: GameState, id: string, hand: string[] = [], heroIds: string[] = []) => {
  gs.registerPlayer(new Player({ id, name: id, hand, partyId: `${id}-party`, actionPoints: 3 }))
  gs.registerParty(new Party({ playerId: id, leaderId: `${id}-leader`, heroIds, monsterIds: [] }))
}

const hero = (id: string, heroClass = HeroClass.Thief) =>
  new HeroCard({ id, name: id, type: CardType.Hero, image: '', description: '', set: 'base', heroClass, rollReq: 5 })

const item = (id: string, cursed = false) =>
  new ItemCard({ id, name: id, type: CardType.Item, image: '', description: '', set: 'base', cursed })

const openWindow = (gs: GameState): IReactionWindow =>
  [...gs.getFrames().values()].flatMap((f) => f.windows).find((w) => w.isOpen())!

/** Answers the open window the way the player would, in the slot it names. */
const answer = (gs: GameState, ctx: AbilityContext, pick?: string) => {
  const window = openWindow(gs)
  ctx.set(window.resultKey() as string, pick === undefined ? [] : [pick])
  window.resolve()
  return window
}

const wire = (gs: GameState) => {
  const em = new GameEventEmitter()
  const emitted: IGameEvent[] = []
  em.addListener({ onEvent: (e) => emitted.push(e) })
  return { em, emitted, rm: new ReactionManager(gs, em) }
}
import { CrownedSerpentAbility } from './crowned-serpent-ability'
import { CONFIRM } from '../../reactions/task-choice-window'
import { RollCompareMode, TriggerScope } from 'shared'
import { MonsterCard } from '../../cards/monster-card'
import { ModifierCard } from '../../cards/modifier-card'
import { TaskManager } from '../../pipelines/task-manager'
import { RollOnHeroAction } from '../../actions/roll-on-hero-action'
import { PlayModifierReaction } from '../../reactions/play-modifier-reaction'
import { abilityRegistry } from './index'

const SERPENT = 'monster-125'
const MOD = 'modifier-077'
const HERO = 'hero-serpent-roll'

const serpent = () =>
  new MonsterCard({
    id: SERPENT,
    name: SERPENT,
    type: CardType.Monster,
    image: '',
    description: '',
    set: 'base',
    partyReq: { classes: ['Any', 'Any'] },
    higherReq: 10,
    lowerReq: 7,
    rollCompareMode: RollCompareMode.HighToWin,
  })

// Crowned Serpent (monster-125): "Whenever anyone plays a modifier, you may
// draw a card."

describe('Crowned Serpent (monster-125)', () => {
  it('listens to anyone\'s modifier and asks its owner', () => {
    expect(CrownedSerpentAbility[0].trigger).toEqual({ on: GameEventType.ModifierPlayed, scope: TriggerScope.Anyone })
    const gs = makeGs()
    seat(gs, 'p1', [])
    seat(gs, 'p2', [])
    const ctx = new AbilityContext('monster-125', 'p1')
    const { em, emitted, rm } = wire(gs)
    CrownedSerpentAbility[0].steps[0].execute(gs, ctx, em, rm)
    const window = openWindow(gs)
    expect(window.getType()).toBe(ReactionWindowType.TaskChoice)
    expect(window.getRespondentId()).toBe('p1')
    window.submitReaction('p1', { choice: CONFIRM })
    const confirmed = emitted.find((e) => e.getType() === GameEventType.TaskConfirmed)!
    expect((confirmed.getPayload() as { label: string }).label).toBe(CrownedSerpentAbility[1].trigger.when)
  })

  it('the yes draws one for the owner', () => {
    const gs = makeGs(['top', 'next'])
    seat(gs, 'p1', [])
    const ctx = new AbilityContext('monster-125', 'p1')
    const { em, rm } = wire(gs)
    CrownedSerpentAbility[1].steps[0].execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['top'])
  })

  // The bug this covers: the Serpent's question parked the stack before the
  // modifier card's own ApplyModifierTask had run, so the roll on every screen
  // still showed the number the modifier was meant to change until the
  // Serpent's owner answered (the owner, 2026-09-07).
  it('asks only AFTER the modifier it is watching has landed on the roll', () => {
    jest.useFakeTimers()
    try {
      const gs = makeGs()
      seat(gs, 'p1', [MOD], [HERO])
      seat(gs, 'p2', [])
      gs.getParty('p2').addMonster(SERPENT)
      gs.registerCard(hero(HERO, HeroClass.Guardian))
      gs.registerCard(serpent())
      gs.registerCard(
        new ModifierCard({
          id: MOD,
          name: 'Modifier',
          type: CardType.Modifier,
          image: '',
          description: '',
          set: 'base',
          values: [2, -2],
        }),
      )
      gs.setCurrentPlayerId('p1')

      const em = new GameEventEmitter()
      const rm = new ReactionManager(gs, em)
      new TaskManager(gs, em, rm, abilityRegistry)

      jest.spyOn(Math, 'random').mockReturnValue(0) // baseRoll 1
      new RollOnHeroAction('a1', 'p1', HERO, em, rm).execute(gs)
      rm.submitReaction(new PlayModifierReaction('r1', 'p1', MOD, 2))

      // The Serpent is asking...
      const ask = gs
        .openWindows()
        .find((w) => w.getType() === ReactionWindowType.TaskChoice)!
      expect(ask.getRespondentId()).toBe('p2')

      // ...and the roll the whole table is watching already counts the card.
      const roll = gs
        .openWindows()
        .find((w) => w.getType() === ReactionWindowType.Modifier)!
      const detail = roll.getDetail()
      expect(detail['bonuses']).toEqual([{ cardSource: MOD, amount: 2 }])
      expect(detail['finalRoll']).toBe((detail['baseRoll'] as number) + 2)
    } finally {
      jest.restoreAllMocks()
      jest.useRealTimers()
    }
  })
})
