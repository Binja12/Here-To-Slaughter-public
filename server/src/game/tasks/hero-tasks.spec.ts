import {
  Audience,
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
} from 'shared'
import { DestroyTask } from './hero-tasks'
import { GameState } from '../pipelines/game-state'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { HeroCard } from '../cards/hero-card'
import {
  AbilityContext,
  CTX_CHOSEN_CARD,
} from '../abilities/ability-context'
import { GameEventEmitter } from '../events/game-event-emitter'
import type { ReactionManager } from '../pipelines/reaction-manager'

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
