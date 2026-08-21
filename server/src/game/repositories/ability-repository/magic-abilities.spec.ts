import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  PassiveType,
  ReactionWindowType,
  TriggerScope,
} from 'shared'
import { DestructiveSpellAbility } from './destructive-spell-ability'
import { EnchantedSpellAbility } from './enchanted-spell-ability'
import { ForcedExchangeAbility } from './forced-exchange-ability'
import { abilityRegistry } from './index'
import { GameState } from '../../pipelines/game-state'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { HeroCard } from '../../cards/hero-card'
import { MagicCard } from '../../cards/magic-card'
import { ItemCard } from '../../cards/item-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { TurnManager } from '../../pipelines/turn-manager'
import { PlayMagicAction } from '../../actions/play-magic-action'
import { IReactionWindow } from '../../interfaces'

// ---------------------------------------------------------------------------
// Three magic cards, three shapes.
//
//   magic-049/050 Destructive Spell  DISCARD 1, then DESTROY a hero anywhere
//   magic-055/056 Enchanted Spell    +2 to ALL your rolls until end of turn
//   magic-057     Forced Exchange    STEAL one from a chosen player, GIVE one back
//
// All three trigger on the SETTLED frame, never on MagicPlayed: a defeated card
// is rolled back out of the instance pile and is not a source when this fires.
// ---------------------------------------------------------------------------

const magic = (id: string) =>
  new MagicCard({
    id,
    name: id,
    type: CardType.Magic,
    image: '',
    description: '',
    set: 'base',
  })

const hero = (id: string) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'base',
    heroClass: HeroClass.Fighter,
    rollReq: 5,
  })

/** Three seats. p1 casts; p2 and p3 each field one hero. */
function setup(spellId: string, casterHand: string[] = []) {
  const gs = new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

  for (const playerId of ['p1', 'p2', 'p3']) {
    gs.registerPlayer(
      new Player({
        id: playerId,
        name: playerId,
        hand: [],
        partyId: `${playerId}-party`,
        actionPoints: 5,
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

  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  const tm = new TurnManager(gs, em)
  new TaskManager(gs, em, rm, abilityRegistry)

  for (const [playerId, heroId] of [
    ['p1', 'p1-hero'],
    ['p2', 'p2-hero'],
    ['p3', 'p3-hero'],
  ] as const) {
    gs.registerCard(hero(heroId))
    gs.getParty(playerId).addHero(heroId, em, 'Played')
  }

  gs.registerCard(magic(spellId))
  gs.getPlayer('p1')!.addToHand(spellId)
  for (const cardId of casterHand) {
    gs.registerCard(magic(cardId))
    gs.getPlayer('p1')!.addToHand(cardId)
  }
  gs.setCurrentPlayerId('p1')

  return { gs, em, rm, tm, events }
}

/** Casts the spell and lets the challenge lapse, so its entry runs. */
function cast(ctx: ReturnType<typeof setup>, spellId: string) {
  new PlayMagicAction('a1', 'p1', spellId, ctx.rm, ctx.em).execute(ctx.gs)
  jest.advanceTimersByTime(5000)
}

const windowOf = (gs: GameState, type: ReactionWindowType) =>
  gs.getFrameByWindowType(type)?.frame.windows.find((w) => w.getType() === type)

const cardChoice = (gs: GameState): IReactionWindow | undefined =>
  windowOf(gs, ReactionWindowType.CardChoice)

const playerChoice = (gs: GameState): IReactionWindow | undefined =>
  windowOf(gs, ReactionWindowType.PlayerChoice)

const optionsOffered = (gs: GameState, type: ReactionWindowType, events: IGameEvent[]) =>
  events
    .filter((e) => e.getType() === GameEventType.ReactionWindowOpened)
    .map((e) => e.getPayload() as Record<string, unknown>)
    .filter((p) => p['windowType'] === type)
    .map((p) => p['options'] as string[])

// ---------------------------------------------------------------------------

describe('magic abilities', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  // =========================================================================
  // Enchanted Spell — magic-055 / magic-056
  // =========================================================================

  describe('Enchanted Spell (magic-055, magic-056)', () => {
    const SPELL = 'magic-055'

    it('is registered for both copies, sharing one declaration', () => {
      expect(abilityRegistry.get('magic-055')).toBe(EnchantedSpellAbility)
      expect(abilityRegistry.get('magic-056')).toBe(EnchantedSpellAbility)
    })

    it('triggers on the settled frame, not on MagicPlayed', () => {
      expect(EnchantedSpellAbility[0].trigger).toEqual({
        on: GameEventType.FrameResolved,
        scope: TriggerScope.SelfCard,
      })
    })

    it('installs a +2 on the caster once the play survives', () => {
      const ctx = setup(SPELL)
      cast(ctx, SPELL)

      expect(
        ctx.gs.getPlayer('p1')!.getAllEffects().filter(
          (e) => e.type === PassiveType.RollBonus,
        ),
      ).toEqual([
        expect.objectContaining({ sourceCardId: SPELL, value: 2 }),
      ])
    })

    it('names NO card and NO roll kind — it lifts everything', () => {
      const ctx = setup(SPELL)
      cast(ctx, SPELL)

      const [effect] = ctx.gs.getEffects(PassiveType.RollBonus, 'p1')
      expect(effect.cardId).toBeUndefined()
      expect(effect.rollContext).toBeUndefined()
    })

    it('reaches an ATTACK roll, which a carrier-scoped bonus would not', () => {
      const ctx = setup(SPELL)
      cast(ctx, SPELL)

      // Asking about no card and the Attack kind: an unscoped effect qualifies.
      expect(
        ctx.gs.getEffects(PassiveType.RollBonus, 'p1', undefined, undefined),
      ).toHaveLength(1)
    })

    it('installs nothing on anybody else', () => {
      const ctx = setup(SPELL)
      cast(ctx, SPELL)

      expect(ctx.gs.getEffects(PassiveType.RollBonus, 'p2')).toEqual([])
    })

    it('ends when the turn does', () => {
      const ctx = setup(SPELL)
      cast(ctx, SPELL)
      expect(ctx.gs.getEffects(PassiveType.RollBonus, 'p1')).toHaveLength(1)

      ctx.tm.endTurn()

      expect(ctx.gs.getEffects(PassiveType.RollBonus, 'p1')).toEqual([])
    })

    it('leaves the spell in the discard when its run is over', () => {
      const ctx = setup(SPELL)
      cast(ctx, SPELL)

      expect(ctx.gs.getDiscardPile().getAll()).toContain(SPELL)
      expect(ctx.gs.getParty('p1').getInstanceCardIds()).not.toContain(SPELL)
    })
  })

  // =========================================================================
  // Destructive Spell — magic-049 / magic-050
  // =========================================================================

  describe('Destructive Spell (magic-049, magic-050)', () => {
    const SPELL = 'magic-049'

    it('is registered for both copies, sharing one declaration', () => {
      expect(abilityRegistry.get('magic-049')).toBe(DestructiveSpellAbility)
      expect(abilityRegistry.get('magic-050')).toBe(DestructiveSpellAbility)
    })

    it('asks for the DISCARD first — the price is printed before the payoff', () => {
      const ctx = setup(SPELL, ['spare-1'])
      ctx.events.length = 0
      cast(ctx, SPELL)

      const [first] = optionsOffered(
        ctx.gs,
        ReactionWindowType.CardChoice,
        ctx.events,
      )
      expect(first).toEqual(['spare-1'])
    })

    it('discards the pick, then offers every hero on the table', () => {
      const ctx = setup(SPELL, ['spare-1'])
      cast(ctx, SPELL)

      cardChoice(ctx.gs)!.submitReaction('p1', { choice: 'spare-1' })

      expect(ctx.gs.getPlayer('p1')!.getHand()).not.toContain('spare-1')
      expect(ctx.gs.getDiscardPile().getAll()).toContain('spare-1')

      const offered = optionsOffered(
        ctx.gs,
        ReactionWindowType.CardChoice,
        ctx.events,
      )
      expect(offered[offered.length - 1]!.sort()).toEqual([
        'p1-hero',
        'p2-hero',
        'p3-hero',
      ])
    })

    it("destroys a hero in ANOTHER player's party", () => {
      const ctx = setup(SPELL, ['spare-1'])
      cast(ctx, SPELL)

      cardChoice(ctx.gs)!.submitReaction('p1', { choice: 'spare-1' })
      cardChoice(ctx.gs)!.submitReaction('p1', { choice: 'p2-hero' })

      expect(ctx.gs.getParty('p2').getHeroIds()).toEqual([])
      expect(ctx.gs.getDiscardPile().getAll()).toContain('p2-hero')
    })

    it('announces the destroy against the party that LOST the hero', () => {
      const ctx = setup(SPELL, ['spare-1'])
      cast(ctx, SPELL)
      cardChoice(ctx.gs)!.submitReaction('p1', { choice: 'spare-1' })
      ctx.events.length = 0
      cardChoice(ctx.gs)!.submitReaction('p1', { choice: 'p2-hero' })

      const destroyed = ctx.events.find(
        (e) => e.getType() === GameEventType.HeroDestroyed,
      )
      expect(destroyed!.getPlayerId()).toBe('p2')
    })

    it('still pays the price when the caster has nothing to destroy', () => {
      const ctx = setup(SPELL, ['spare-1'])
      // Empty every party, so the second choice has no options.
      for (const [p, h] of [
        ['p1', 'p1-hero'],
        ['p2', 'p2-hero'],
        ['p3', 'p3-hero'],
      ] as const) {
        ctx.gs.getParty(p).removeHero(h, ctx.em, 'Destroyed')
      }

      cast(ctx, SPELL)
      cardChoice(ctx.gs)!.submitReaction('p1', { choice: 'spare-1' })
      jest.advanceTimersByTime(1)

      expect(ctx.gs.getDiscardPile().getAll()).toContain('spare-1')
      expect(ctx.gs.hasOpenFrames()).toBe(false)
    })

    it('costs nothing extra when the caster hand is empty', () => {
      const ctx = setup(SPELL)
      cast(ctx, SPELL)
      jest.advanceTimersByTime(1)

      // No cards to discard, so the price is skipped and the destroy proceeds.
      cardChoice(ctx.gs)!.submitReaction('p1', { choice: 'p2-hero' })

      expect(ctx.gs.getParty('p2').getHeroIds()).toEqual([])
    })
  })

  // =========================================================================
  // Forced Exchange — magic-057
  // =========================================================================

  describe('Forced Exchange (magic-057)', () => {
    const SPELL = 'magic-057'

    /** Runs the whole exchange: pick a player, take one, hand one back. */
    const exchange = (
      ctx: ReturnType<typeof setup>,
      withPlayer: string,
      take: string,
      give: string,
    ) => {
      playerChoice(ctx.gs)!.submitReaction('p1', { choice: withPlayer })
      cardChoice(ctx.gs)!.submitReaction('p1', { choice: take })
      cardChoice(ctx.gs)!.submitReaction('p1', { choice: give })
    }

    it('is registered', () => {
      expect(abilityRegistry.get(SPELL)).toBe(ForcedExchangeAbility)
    })

    it('offers the OPPONENTS, never the caster', () => {
      const ctx = setup(SPELL)
      ctx.events.length = 0
      cast(ctx, SPELL)

      expect(playerChoice(ctx.gs)).toBeDefined()
      const [offered] = optionsOffered(
        ctx.gs,
        ReactionWindowType.PlayerChoice,
        ctx.events,
      )
      expect(offered!.sort()).toEqual(['p2', 'p3'])
    })

    it('then offers only the CHOSEN player party — Owner.Chosen late-binds', () => {
      const ctx = setup(SPELL)
      cast(ctx, SPELL)

      playerChoice(ctx.gs)!.submitReaction('p1', { choice: 'p3' })

      const offered = optionsOffered(
        ctx.gs,
        ReactionWindowType.CardChoice,
        ctx.events,
      )
      expect(offered[offered.length - 1]).toEqual(['p3-hero'])
    })

    it('swaps both ways: their hero comes, one of yours goes', () => {
      const ctx = setup(SPELL)
      cast(ctx, SPELL)

      exchange(ctx, 'p3', 'p3-hero', 'p1-hero')

      expect(ctx.gs.getParty('p1').getHeroIds()).toEqual(['p3-hero'])
      expect(ctx.gs.getParty('p3').getHeroIds()).toEqual(['p1-hero'])
    })

    it('announces the steal, naming both sides', () => {
      const ctx = setup(SPELL)
      cast(ctx, SPELL)
      playerChoice(ctx.gs)!.submitReaction('p1', { choice: 'p2' })
      ctx.events.length = 0
      cardChoice(ctx.gs)!.submitReaction('p1', { choice: 'p2-hero' })

      const stolen = ctx.events.find(
        (e) => e.getType() === GameEventType.HeroStolen,
      )
      expect(stolen!.getPayload()).toMatchObject({
        cardId: 'p2-hero',
        fromPlayerId: 'p2',
        toPlayerId: 'p1',
      })
    })

    it('announces the give as the canonical pair, reason Given', () => {
      const ctx = setup(SPELL)
      cast(ctx, SPELL)
      playerChoice(ctx.gs)!.submitReaction('p1', { choice: 'p3' })
      cardChoice(ctx.gs)!.submitReaction('p1', { choice: 'p3-hero' })
      ctx.events.length = 0
      cardChoice(ctx.gs)!.submitReaction('p1', { choice: 'p1-hero' })

      const payloads = ctx.events
        .filter(
          (e) =>
            e.getType() === GameEventType.HeroRemovedFromParty ||
            e.getType() === GameEventType.HeroAddedToParty,
        )
        .map((e) => e.getPayload() as Record<string, unknown>)

      expect(payloads).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            cardId: 'p1-hero',
            playerId: 'p1',
            reason: 'Given',
          }),
          expect.objectContaining({
            cardId: 'p1-hero',
            playerId: 'p3',
            reason: 'Given',
          }),
        ]),
      )
    })

    // --- gear rides along, in both directions ---

    describe('equipment', () => {
      const gear = (
        ctx: ReturnType<typeof setup>,
        heroId: string,
        itemId: string,
        ownerId: string,
      ) => {
        ctx.gs.registerCard(
          new ItemCard({
            id: itemId,
            name: itemId,
            type: CardType.Item,
            image: '',
            description: '',
            set: 'base',
            cursed: false,
          }),
        )
        ctx.gs.getParty(ownerId).equipItem(heroId, itemId)
      }

      it('carries the STOLEN hero gear into the caster party', () => {
        const ctx = setup(SPELL)
        gear(ctx, 'p3-hero', 'their-item', 'p3')
        cast(ctx, SPELL)

        exchange(ctx, 'p3', 'p3-hero', 'p1-hero')

        expect(ctx.gs.getParty('p1').getEquippedItem('p3-hero')).toBe(
          'their-item',
        )
      })

      it('carries the GIVEN hero gear out to the other party', () => {
        const ctx = setup(SPELL)
        gear(ctx, 'p1-hero', 'my-item', 'p1')
        cast(ctx, SPELL)

        exchange(ctx, 'p3', 'p3-hero', 'p1-hero')

        expect(ctx.gs.getParty('p3').getEquippedItem('p1-hero')).toBe('my-item')
      })

      it('loses neither item to a discard — an exchange destroys nothing', () => {
        const ctx = setup(SPELL)
        gear(ctx, 'p3-hero', 'their-item', 'p3')
        gear(ctx, 'p1-hero', 'my-item', 'p1')
        cast(ctx, SPELL)

        exchange(ctx, 'p3', 'p3-hero', 'p1-hero')

        expect(ctx.gs.getDiscardPile().getAll()).not.toContain('their-item')
        expect(ctx.gs.getDiscardPile().getAll()).not.toContain('my-item')
      })
    })

    // --- edges ---

    it('never OFFERS a player with an empty party', () => {
      const ctx = setup(SPELL)
      ctx.gs.getParty('p2').removeHero('p2-hero', ctx.em, 'Destroyed')
      ctx.events.length = 0

      cast(ctx, SPELL)

      // Both clauses are about that player's party, so a seat with nobody in
      // it is a choice that could not be carried out.
      const [offered] = optionsOffered(
        ctx.gs,
        ReactionWindowType.PlayerChoice,
        ctx.events,
      )
      expect(offered).toEqual(['p3'])
    })

    it('offers nobody at all when every opponent party is empty', () => {
      const ctx = setup(SPELL)
      ctx.gs.getParty('p2').removeHero('p2-hero', ctx.em, 'Destroyed')
      ctx.gs.getParty('p3').removeHero('p3-hero', ctx.em, 'Destroyed')
      ctx.events.length = 0

      cast(ctx, SPELL)
      // Two empty choices settle back to back, each on its own 0ms timer, and
      // the second is scheduled from inside the first one's callback.
      jest.advanceTimersByTime(1)
      jest.advanceTimersByTime(1)

      const [offered] = optionsOffered(
        ctx.gs,
        ReactionWindowType.PlayerChoice,
        ctx.events,
      )
      expect(offered).toEqual([])
      // Nothing was taken, so nothing is handed back.
      expect(ctx.gs.getParty('p1').getHeroIds()).toEqual(['p1-hero'])
      expect(ctx.gs.hasOpenFrames()).toBe(false)
    })

    it('CANCELS the give when the steal was refused', () => {
      const ctx = setup(SPELL)
      // p2 is protected, so the steal produces nothing even though the choice
      // was legal when it was offered.
      ctx.gs.addEffect({
        id: 'guard',
        sourceCardId: 'some-card',
        ownerId: 'p2',
        type: PassiveType.CantBeStolen,
      })

      cast(ctx, SPELL)
      playerChoice(ctx.gs)!.submitReaction('p1', { choice: 'p2' })
      cardChoice(ctx.gs)!.submitReaction('p1', { choice: 'p2-hero' })

      // "you may give" is only reachable through "you stole": both the prompt
      // and the move read the slot the steal fills, and an unmade steal leaves
      // it empty. The caster is never even asked.
      expect(cardChoice(ctx.gs)).toBeUndefined()
      expect(ctx.gs.getParty('p1').getHeroIds()).toEqual(['p1-hero'])
      expect(ctx.gs.getParty('p2').getHeroIds()).toEqual(['p2-hero'])
      expect(ctx.gs.hasOpenFrames()).toBe(false)
    })

    it('offers the just-stolen hero back — it is in your party by then', () => {
      const ctx = setup(SPELL)
      cast(ctx, SPELL)
      playerChoice(ctx.gs)!.submitReaction('p1', { choice: 'p3' })
      cardChoice(ctx.gs)!.submitReaction('p1', { choice: 'p3-hero' })

      const offered = optionsOffered(
        ctx.gs,
        ReactionWindowType.CardChoice,
        ctx.events,
      )
      expect(offered[offered.length - 1]!.sort()).toEqual([
        'p1-hero',
        'p3-hero',
      ])
    })

    it('hands back to the player it STOLE from, not merely the one chosen', () => {
      const ctx = setup(SPELL)
      cast(ctx, SPELL)

      exchange(ctx, 'p3', 'p3-hero', 'p1-hero')

      expect(ctx.gs.getParty('p3').getHeroIds()).toEqual(['p1-hero'])
      expect(ctx.gs.getParty('p2').getHeroIds()).toEqual(['p2-hero'])
    })

    it('an empty caster party can only hand back what it just took', () => {
      const ctx = setup(SPELL)
      ctx.gs.getParty('p1').removeHero('p1-hero', ctx.em, 'Destroyed')
      cast(ctx, SPELL)

      playerChoice(ctx.gs)!.submitReaction('p1', { choice: 'p2' })
      cardChoice(ctx.gs)!.submitReaction('p1', { choice: 'p2-hero' })

      // The steal already stood, so the only hero the caster fields is the one
      // it just took — that is the whole option list.
      const offered = optionsOffered(
        ctx.gs,
        ReactionWindowType.CardChoice,
        ctx.events,
      )
      expect(offered[offered.length - 1]).toEqual(['p2-hero'])

      cardChoice(ctx.gs)!.submitReaction('p1', { choice: 'p2-hero' })

      // Net zero, and nothing left hanging.
      expect(ctx.gs.getParty('p1').getHeroIds()).toEqual([])
      expect(ctx.gs.getParty('p2').getHeroIds()).toEqual(['p2-hero'])
      expect(ctx.gs.hasOpenFrames()).toBe(false)
    })
  })
})
