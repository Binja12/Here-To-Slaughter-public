import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  ReactionWindowType,
  RollCompareMode,
  TriggerScope,
} from 'shared'
import { MalamammothAbility } from './malamammoth-ability'
import { OrthusAbility } from './orthus-ability'
import { abilityRegistry } from './index'
import { GameState } from '../../pipelines/game-state'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { HeroCard } from '../../cards/hero-card'
import { ItemCard } from '../../cards/item-card'
import { MagicCard } from '../../cards/magic-card'
import { MonsterCard } from '../../cards/monster-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { DrawCardAction } from '../../actions/draw-card-action'
import { CONFIRM, DISMISS } from '../../reactions/task-choice-window'

// ---------------------------------------------------------------------------
// The two monsters that react to a DRAW.
//
//   monster-131 Orthus       DRAW a Magic card → may play it immediately
//   monster-134 Malamammoth  DRAW an Item card → may play it immediately
//
// Both hang off CardDrawn's ctxSeed: an entry TRIGGERED by a draw runs with a
// fresh context, so the drawn card has to travel on the event. Snowball is the
// contrast — it draws for itself and fills the slot from its own step.
// ---------------------------------------------------------------------------

const monster = (id: string) =>
  new MonsterCard({
    id,
    name: id,
    type: CardType.Monster,
    image: '',
    description: '',
    set: 'base',
    partyReq: { classes: [] },
    higherReq: 8,
    lowerReq: 4,
    rollCompareMode: RollCompareMode.HighToWin,
  })

const hero = (id: string) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'base',
    heroClass: HeroClass.Ranger,
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

const magic = (id: string) =>
  new MagicCard({
    id,
    name: id,
    type: CardType.Magic,
    image: '',
    description: '',
    set: 'base',
  })

/** `monsterId` sits in p1's party; `deck` is drawn from the top. */
function setup(monsterId: string, deck: string[] = []) {
  const gs = new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

  for (const playerId of ['p1', 'p2']) {
    gs.registerPlayer(
      new Player({
        id: playerId,
        name: playerId,
        hand: [],
        partyId: `${playerId}-party`,
        actionPoints: 3,
      }),
    )
    gs.registerParty(
      new Party({
        playerId,
        leaderId: `${playerId}-leader`,
        heroIds: [],
        monsterIds: [],
      }),
    )
  }

  gs.registerCard(monster(monsterId))
  gs.getParty('p1').addMonster(monsterId)
  gs.setCurrentPlayerId('p1')

  for (const cardId of [...deck].reverse()) gs.getMainDeck().addToTop(cardId)

  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  new TaskManager(gs, em, rm, abilityRegistry)

  return { gs, em, rm, events }
}

const draw = (ctx: ReturnType<typeof setup>) =>
  new DrawCardAction('a1', 'p1', ctx.em).execute(ctx.gs)

const windowOfType = (gs: GameState, type: ReactionWindowType) =>
  gs.getFrameByWindowType(type)?.frame.windows.find((w) => w.getType() === type)

const offer = (gs: GameState) =>
  windowOfType(gs, ReactionWindowType.TaskChoice)

const cardChoice = (gs: GameState) =>
  windowOfType(gs, ReactionWindowType.CardChoice)

// ---------------------------------------------------------------------------

describe('monsters that react to a DRAW', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  // =========================================================================
  // Orthus — monster-131
  // =========================================================================

  describe('Orthus (monster-131) — DRAW a Magic card, may play it', () => {
    it('is registered, and its first entry listens to any draw its owner makes', () => {
      expect(abilityRegistry.get('monster-131')).toBe(OrthusAbility)
      expect(OrthusAbility[0].trigger).toEqual({
        on: GameEventType.CardDrawn,
        scope: TriggerScope.OwnerEvent,
      })
    })

    it('offers the play when the drawn card is Magic', () => {
      const ctx = setup('monster-131', ['magic-1'])
      ctx.gs.registerCard(magic('magic-1'))

      draw(ctx)

      expect(offer(ctx.gs)).toBeDefined()
    })

    it('says nothing when the drawn card is not Magic', () => {
      const ctx = setup('monster-131', ['item-1'])
      ctx.gs.registerCard(item('item-1'))

      draw(ctx)

      expect(offer(ctx.gs)).toBeUndefined()
      expect(
        ctx.events.some((e) => e.getType() === GameEventType.ConditionMet),
      ).toBe(false)
    })

    it('plays the drawn card on CONFIRM', () => {
      const ctx = setup('monster-131', ['magic-1'])
      ctx.gs.registerCard(magic('magic-1'))

      draw(ctx)
      offer(ctx.gs)!.submitReaction('p1', { choice: CONFIRM })

      expect(
        ctx.events.some((e) => e.getType() === GameEventType.MagicPlayed),
      ).toBe(true)
      expect(ctx.gs.getPlayer('p1')!.getHand()).not.toContain('magic-1')
    })

    it('keeps the card in hand on DISMISS', () => {
      const ctx = setup('monster-131', ['magic-1'])
      ctx.gs.registerCard(magic('magic-1'))

      draw(ctx)
      offer(ctx.gs)!.submitReaction('p1', { choice: DISMISS })

      expect(
        ctx.events.some((e) => e.getType() === GameEventType.MagicPlayed),
      ).toBe(false)
      expect(ctx.gs.getPlayer('p1')!.getHand()).toContain('magic-1')
    })

    it('names the RIGHT card — the one just drawn, off the event seed', () => {
      const ctx = setup('monster-131', ['magic-1'])
      ctx.gs.registerCard(magic('magic-1'))
      ctx.gs.registerCard(magic('magic-held'))
      ctx.gs.getPlayer('p1')!.addToHand('magic-held')

      draw(ctx)
      offer(ctx.gs)!.submitReaction('p1', { choice: CONFIRM })

      const played = ctx.events.find(
        (e) => e.getType() === GameEventType.MagicPlayed,
      )
      expect(played!.getPayload()).toMatchObject({ cardId: 'magic-1' })
    })

    it('does nothing for a draw by the player who does NOT own it', () => {
      const ctx = setup('monster-131', ['magic-1'])
      ctx.gs.registerCard(magic('magic-1'))
      ctx.gs.setCurrentPlayerId('p2')

      new DrawCardAction('a1', 'p2', ctx.em).execute(ctx.gs)

      expect(offer(ctx.gs)).toBeUndefined()
    })
  })

  // =========================================================================
  // Malamammoth — monster-134
  // =========================================================================

  describe('Malamammoth (monster-134) — DRAW an Item card, may play it', () => {
    /** A hero to receive the item, optionally already carrying something. */
    const withHero = (
      ctx: ReturnType<typeof setup>,
      heroId: string,
      carrying?: string,
    ) => {
      ctx.gs.registerCard(hero(heroId))
      ctx.gs.getParty('p1').addHero(heroId, ctx.em, 'Played')
      if (carrying) {
        ctx.gs.registerCard(item(carrying))
        ctx.gs.getParty('p1').equipItem(heroId, carrying)
      }
    }

    it('is registered, and its first entry listens to any draw its owner makes', () => {
      expect(abilityRegistry.get('monster-134')).toBe(MalamammothAbility)
      expect(MalamammothAbility[0].trigger).toEqual({
        on: GameEventType.CardDrawn,
        scope: TriggerScope.OwnerEvent,
      })
    })

    it('offers the play when the drawn card is an Item', () => {
      const ctx = setup('monster-134', ['item-1'])
      ctx.gs.registerCard(item('item-1'))
      withHero(ctx, 'hero-1')

      draw(ctx)

      expect(offer(ctx.gs)).toBeDefined()
    })

    it('says nothing when the drawn card is not an Item', () => {
      const ctx = setup('monster-134', ['magic-1'])
      ctx.gs.registerCard(magic('magic-1'))
      withHero(ctx, 'hero-1')

      draw(ctx)

      expect(offer(ctx.gs)).toBeUndefined()
    })

    it('equips the drawn item to the hero the player picks', () => {
      const ctx = setup('monster-134', ['item-1'])
      ctx.gs.registerCard(item('item-1'))
      withHero(ctx, 'hero-1')

      draw(ctx)
      offer(ctx.gs)!.submitReaction('p1', { choice: CONFIRM })
      cardChoice(ctx.gs)!.submitReaction('p1', { choice: 'hero-1' })

      expect(ctx.gs.getEquippedItem('hero-1')).toBe('item-1')
    })

    // --- the no-target problem ---

    describe('when no hero can take it', () => {
      it('offers no hero at all when every one is already carrying something', () => {
        const ctx = setup('monster-134', ['item-1'])
        ctx.gs.registerCard(item('item-1'))
        withHero(ctx, 'hero-1', 'item-worn')

        draw(ctx)
        offer(ctx.gs)!.submitReaction('p1', { choice: CONFIRM })

        const opened = ctx.events
          .map((e) => e.getPayload() as Record<string, unknown>)
          .find((p) => p['windowType'] === ReactionWindowType.CardChoice)
        expect(opened!['options']).toEqual([])
      })

      it('leaves the item in hand and the worn one untouched', () => {
        const ctx = setup('monster-134', ['item-1'])
        ctx.gs.registerCard(item('item-1'))
        withHero(ctx, 'hero-1', 'item-worn')

        draw(ctx)
        offer(ctx.gs)!.submitReaction('p1', { choice: CONFIRM })
        jest.advanceTimersByTime(1)

        expect(ctx.gs.getPlayer('p1')!.getHand()).toContain('item-1')
        expect(ctx.gs.getEquippedItem('hero-1')).toBe('item-worn')
      })

      it('stalls nothing — no frame is left open', () => {
        const ctx = setup('monster-134', ['item-1'])
        ctx.gs.registerCard(item('item-1'))
        withHero(ctx, 'hero-1', 'item-worn')

        draw(ctx)
        offer(ctx.gs)!.submitReaction('p1', { choice: CONFIRM })
        jest.advanceTimersByTime(1)

        expect(ctx.gs.hasOpenFrames()).toBe(false)
        expect(ctx.gs.getPipelines()).toHaveLength(0)
      })

      it('behaves the same with no heroes in the party at all', () => {
        const ctx = setup('monster-134', ['item-1'])
        ctx.gs.registerCard(item('item-1'))

        draw(ctx)
        offer(ctx.gs)!.submitReaction('p1', { choice: CONFIRM })
        jest.advanceTimersByTime(1)

        expect(ctx.gs.getPlayer('p1')!.getHand()).toContain('item-1')
        expect(ctx.gs.hasOpenFrames()).toBe(false)
      })

      it('offers only the FREE hero when one of two is carrying', () => {
        const ctx = setup('monster-134', ['item-1'])
        ctx.gs.registerCard(item('item-1'))
        withHero(ctx, 'hero-busy', 'item-worn')
        withHero(ctx, 'hero-free')

        draw(ctx)
        offer(ctx.gs)!.submitReaction('p1', { choice: CONFIRM })

        const opened = ctx.events
          .map((e) => e.getPayload() as Record<string, unknown>)
          .find((p) => p['windowType'] === ReactionWindowType.CardChoice)
        expect(opened!['options']).toEqual(['hero-free'])
      })
    })
  })
})
