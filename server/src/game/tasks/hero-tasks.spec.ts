import {
  Audience,
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  PassiveType,
} from 'shared'
import { DestroyTask, SacrificeTask } from './hero-tasks'
import { GameState } from '../pipelines/game-state'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { HeroCard } from '../cards/hero-card'
import {
  AbilityContext,
  CTX_CHOSEN_CARD,
  CTX_CHOSEN_PLAYER,
  CTX_DESTROYED_HERO_ITEM,
} from '../abilities/ability-context'
import { GameEventEmitter } from '../events/game-event-emitter'
import type { ReactionManager } from '../pipelines/reaction-manager'
import { ItemCard } from '../cards/item-card'

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const makeGs = () =>
  new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

const makePlayer = (id: string, hand: string[] = []) =>
  new Player({ id, name: id, hand, partyId: `${id}-party`, actionPoints: 3 })

const makeParty = (playerId: string, heroIds: string[] = []) =>
  new Party({
    playerId,
    leaderId: `${playerId}-leader`,
    heroIds,
    monsterIds: [],
  })

const makeHeroCard = (id: string) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'test',
    heroClass: HeroClass.Fighter,
    rollReq: 5,
  })

const makeCtx = (sourceCardId = 'src-card', ownerId = 'p1') =>
  new AbilityContext(sourceCardId, ownerId)

/** Returns an emitter pre-wired with a spy that collects every emitted event. */
const makeEmitter = () => {
  const emitter = new GameEventEmitter()
  const emitted: IGameEvent[] = []
  emitter.addListener({ onEvent: (e) => emitted.push(e) })
  return { emitter, emitted }
}

/** Stub ReactionManager — DestroyTask does not open frames. */
const stubRm = null as unknown as ReactionManager

// ---------------------------------------------------------------------------
// DestroyTask
// ---------------------------------------------------------------------------

describe('SacrificeTask with an actor — "that player must SACRIFICE"', () => {
  it("removes the chosen hero from the ACTOR's party and announces the actor as the loser", () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', ['mine']))
    gs.registerPlayer(makePlayer('p2'))
    gs.registerParty(makeParty('p2', ['theirs']))
    gs.registerCard(makeHeroCard('mine'))
    gs.registerCard(makeHeroCard('theirs'))
    const { emitter, emitted } = makeEmitter()
    const ctx = makeCtx('hero-033', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])
    ctx.set(CTX_CHOSEN_CARD, ['theirs'])

    new SacrificeTask({ executor: 'chosen' }).execute(gs, ctx, emitter, stubRm)

    expect(gs.getParty('p2').getHeroIds()).toEqual([])
    expect(gs.getParty('p1').getHeroIds()).toEqual(['mine'])
    expect(gs.getDiscardPile().getAll()).toContain('theirs')
    const sacrificed = emitted.find((e: IGameEvent) => e.getType() === GameEventType.HeroSacrificed)!
    expect(sacrificed.getPlayerId()).toBe('p2')
  })
})

describe('SacrificeTask — the Decoy Doll takes the hit', () => {
  it('the doll goes to the pile in place of the sacrificed hero', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', ['hero-1']))
    gs.registerCard(makeHeroCard('hero-1'))
    gs.registerCard(new ItemCard({ id: 'item-066', name: 'Decoy Doll', type: CardType.Item, image: '', description: '', set: 'base', cursed: false }))
    gs.equipItem('hero-1', 'item-066')
    gs.addEffect({ id: 'doll', sourceCardId: 'item-066', ownerId: 'p1', type: PassiveType.TakesTheHit, cardId: 'hero-1' })
    const ctx = makeCtx('src', 'p1')
    ctx.set(CTX_CHOSEN_CARD, ['hero-1'])
    const { emitter, emitted } = makeEmitter()

    new SacrificeTask().execute(gs, ctx, emitter, stubRm)

    expect(gs.getParty('p1').getHeroIds()).toEqual(['hero-1'])
    expect(gs.getDiscardPile().getAll()).toEqual(['item-066'])
    expect(emitted.map((e: IGameEvent) => e.getType())).not.toContain(GameEventType.HeroSacrificed)
  })
})

describe('DestroyTask', () => {
  /** Puts the chosen hero on the context, the way a ChooseCardTask would. */
  const chose = (heroId: string, ownerId = 'p1') => {
    const ctx = makeCtx('src-card', ownerId)
    ctx.set(CTX_CHOSEN_CARD, [heroId])
    return ctx
  }

  it('removes the chosen hero from the party and adds it to the discard pile', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', ['hero-1', 'hero-2']))
    gs.registerCard(makeHeroCard('hero-1'))
    const { emitter } = makeEmitter()

    new DestroyTask().execute(gs, chose('hero-1'), emitter, stubRm)

    expect(gs.getParty('p1').getHeroIds()).not.toContain('hero-1')
    expect(gs.getParty('p1').getHeroIds()).toContain('hero-2')
    expect(gs.getDiscardPile().getAll()).toContain('hero-1')
  })

  it('leaves the hero alone while its owner holds CantBeDestroyed — Mighty Blade, Terratuga', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', ['hero-1']))
    gs.registerCard(makeHeroCard('hero-1'))
    gs.addEffect({
      id: 'shield',
      sourceCardId: 'hero-031',
      ownerId: 'p1',
      type: PassiveType.CantBeDestroyed,
    })
    const { emitter, emitted } = makeEmitter()

    new DestroyTask().execute(gs, chose('hero-1'), emitter, stubRm)

    expect(gs.getParty('p1').getHeroIds()).toContain('hero-1')
    expect(gs.getDiscardPile().getAll()).not.toContain('hero-1')
    expect(emitted.map((e: IGameEvent) => e.getType())).not.toContain(GameEventType.HeroDestroyed)
  })

  it('the Decoy Doll takes the hit: the doll goes to the pile, the hero stays', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', ['hero-1']))
    gs.registerCard(makeHeroCard('hero-1'))
    gs.registerCard(new ItemCard({ id: 'item-066', name: 'Decoy Doll', type: CardType.Item, image: '', description: '', set: 'base', cursed: false }))
    gs.equipItem('hero-1', 'item-066')
    gs.addEffect({ id: 'doll', sourceCardId: 'item-066', ownerId: 'p1', type: PassiveType.TakesTheHit, cardId: 'hero-1' })
    const { emitter, emitted } = makeEmitter()

    new DestroyTask().execute(gs, chose('hero-1'), emitter, stubRm)

    expect(gs.getParty('p1').getHeroIds()).toContain('hero-1')
    expect(gs.getEquippedItem('hero-1')).toBeUndefined()
    expect(gs.getDiscardPile().getAll()).toEqual(['item-066'])
    expect(emitted.map((e: IGameEvent) => e.getType())).toEqual([GameEventType.ItemUnequipped])
  })

  it('Corrupted Sabretooth: the destroyer STEALS the hero instead', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1'))
    gs.registerPlayer(makePlayer('p2'))
    gs.registerParty(makeParty('p2', ['theirs']))
    gs.registerCard(makeHeroCard('theirs'))
    gs.addEffect({ id: 'saber', sourceCardId: 'monster-122', ownerId: 'p1', type: PassiveType.StealsInsteadOfDestroy })
    const { emitter, emitted } = makeEmitter()

    new DestroyTask().execute(gs, chose('theirs', 'p1'), emitter, stubRm)

    expect(gs.getParty('p1').getHeroIds()).toEqual(['theirs'])
    expect(gs.getParty('p2').getHeroIds()).toEqual([])
    expect(gs.getDiscardPile().getAll()).toEqual([])
    const types = emitted.map((e: IGameEvent) => e.getType())
    expect(types).toContain(GameEventType.HeroStolen)
    expect(types).not.toContain(GameEventType.HeroDestroyed)
  })

  it('Corrupted Sabretooth does not turn destroying your OWN hero into a steal', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', ['mine']))
    gs.registerCard(makeHeroCard('mine'))
    gs.addEffect({ id: 'saber', sourceCardId: 'monster-122', ownerId: 'p1', type: PassiveType.StealsInsteadOfDestroy })
    const { emitter } = makeEmitter()

    new DestroyTask().execute(gs, chose('mine', 'p1'), emitter, stubRm)

    expect(gs.getParty('p1').getHeroIds()).toEqual([])
    expect(gs.getDiscardPile().getAll()).toEqual(['mine'])
  })

  it('emits the canonical removal event, then HeroDestroyed (All)', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', ['hero-1']))
    const { emitter, emitted } = makeEmitter()

    new DestroyTask().execute(gs, chose('hero-1'), emitter, stubRm)

    // Canonical first (Party.removeHero announces the moment of removal),
    // specific second (the completed operation, with its richer payload).
    expect(emitted).toHaveLength(2)
    expect(emitted[0].getType()).toBe(GameEventType.HeroRemovedFromParty)
    expect((emitted[0].getPayload() as any).reason).toBe('Destroyed')
    expect(emitted[1].getType()).toBe(GameEventType.HeroDestroyed)
    expect(emitted[1].getAudience()).toBe(Audience.All)
    expect((emitted[1].getPayload() as any).cardId).toBe('hero-1')
  })

  // --- reach: ANY party, which is the whole difference from a sacrifice ---

  it("destroys a hero in ANOTHER player's party", () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', []))
    gs.registerPlayer(makePlayer('p2'))
    gs.registerParty(makeParty('p2', ['victim']))
    gs.registerCard(makeHeroCard('victim'))
    const { emitter } = makeEmitter()

    new DestroyTask().execute(gs, chose('victim'), emitter, stubRm)

    expect(gs.getParty('p2').getHeroIds()).toEqual([])
    expect(gs.getDiscardPile().getAll()).toContain('victim')
  })

  it('announces the party that LOST the hero, not the one that caused it', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', []))
    gs.registerPlayer(makePlayer('p2'))
    gs.registerParty(makeParty('p2', ['victim']))
    const { emitter, emitted } = makeEmitter()

    new DestroyTask().execute(gs, chose('victim'), emitter, stubRm)

    // Dracos is printed "a Hero card in YOUR Party is destroyed" and needs the
    // loser to scope against.
    expect(emitted[1].getPlayerId()).toBe('p2')
  })

  it('takes the gear down with the hero', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', ['hero-1']))
    gs.getParty('p1').equipItem('hero-1', 'item-1')
    const { emitter } = makeEmitter()

    new DestroyTask().execute(gs, chose('hero-1'), emitter, stubRm)

    expect(gs.getDiscardPile().getAll()).toEqual(
      expect.arrayContaining(['hero-1', 'item-1']),
    )
  })

  // --- the slot contract ---

  it('throws when the slot it was named holds nothing', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', []))
    const { emitter } = makeEmitter()

    expect(() =>
      new DestroyTask().execute(gs, makeCtx(), emitter, stubRm),
    ).toThrow(/nothing has written/)
  })

  it('skips an empty slot — the step ahead produced nothing', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', ['hero-1']))
    const { emitter, emitted } = makeEmitter()
    const ctx = makeCtx()
    ctx.set(CTX_CHOSEN_CARD, [])

    new DestroyTask().execute(gs, ctx, emitter, stubRm)

    expect(emitted).toHaveLength(0)
    expect(gs.getParty('p1').getHeroIds()).toContain('hero-1')
  })

  it('emits nothing when the hero is in no party at all', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', []))
    const { emitter, emitted } = makeEmitter()

    new DestroyTask().execute(gs, chose('missing'), emitter, stubRm)

    expect(emitted).toHaveLength(0)
  })

  it('leaves a card sitting in a HAND alone — destroy is about parties', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1', ['in-hand']))
    gs.registerParty(makeParty('p1', []))
    const { emitter, emitted } = makeEmitter()

    new DestroyTask().execute(gs, chose('in-hand'), emitter, stubRm)

    expect(emitted).toHaveLength(0)
    expect(gs.getPlayer('p1')!.getHand()).toContain('in-hand')
  })
})

describe('DestroyTask — names the gear that went down', () => {
  it('the carried item lands on the pile silently and is named in CTX_DESTROYED_HERO_ITEM', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1'))
    gs.registerPlayer(makePlayer('p2'))
    gs.registerParty(makeParty('p2', ['h2']))
    gs.registerCard(makeHeroCard('h2'))
    gs.registerCard(new ItemCard({ id: 'sword', name: 'sword', type: CardType.Item, image: '', description: '', set: 'base', cursed: false }))
    gs.equipItem('h2', 'sword')
    const ctx = new AbilityContext('src', 'p1')
    ctx.set(CTX_CHOSEN_CARD, ['h2'])
    const em = new GameEventEmitter()
    const emitted: IGameEvent[] = []
    em.addListener({ onEvent: (e) => emitted.push(e) })
    new DestroyTask().execute(gs, ctx, em, null as unknown as ReactionManager)
    expect(ctx.get(CTX_DESTROYED_HERO_ITEM)).toEqual(['sword'])
    expect(gs.getDiscardPile().getAll()).toEqual(['sword', 'h2'])
    expect(emitted.map((e) => e.getType())).not.toContain(GameEventType.CardDiscarded)
  })

  it('a bare hero, or no destroy at all, names nothing', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1'))
    gs.registerPlayer(makePlayer('p2'))
    gs.registerParty(makeParty('p2', ['h2']))
    gs.registerCard(makeHeroCard('h2'))
    const ctx = new AbilityContext('src', 'p1')
    const em = new GameEventEmitter()
    ctx.set(CTX_CHOSEN_CARD, ['h2'])
    new DestroyTask().execute(gs, ctx, em, null as unknown as ReactionManager)
    expect(ctx.get(CTX_DESTROYED_HERO_ITEM)).toEqual([])
    ctx.set(CTX_CHOSEN_CARD, [])
    new DestroyTask().execute(gs, ctx, em, null as unknown as ReactionManager)
    expect(ctx.get(CTX_DESTROYED_HERO_ITEM)).toEqual([])
  })
})

