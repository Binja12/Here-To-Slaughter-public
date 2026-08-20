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
import { AbilityContext } from '../abilities/ability-context'
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
  it('removes the explicit heroId from party and adds it to the discard pile', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', ['hero-1', 'hero-2']))
    gs.registerCard(makeHeroCard('hero-1'))
    const { emitter } = makeEmitter()

    new DestroyTask('hero-1').execute(gs, makeCtx(), emitter, stubRm)

    expect(gs.getParty('p1').getHeroIds()).not.toContain('hero-1')
    expect(gs.getParty('p1').getHeroIds()).toContain('hero-2')
    expect(gs.getDiscardPile().getAll()).toContain('hero-1')
  })

  it('emits the canonical removal event, then HeroDestroyed (All)', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', ['hero-1']))
    const { emitter, emitted } = makeEmitter()

    new DestroyTask('hero-1').execute(gs, makeCtx(), emitter, stubRm)

    // Canonical first (Party.removeHero announces the moment of removal),
    // specific second (the completed operation, with its richer payload).
    expect(emitted).toHaveLength(2)
    expect(emitted[0].getType()).toBe(GameEventType.HeroRemovedFromParty)
    expect((emitted[0].getPayload() as any).reason).toBe('Destroyed')
    expect(emitted[1].getType()).toBe(GameEventType.HeroDestroyed)
    expect(emitted[1].getAudience()).toBe(Audience.All)
    expect((emitted[1].getPayload() as any).cardId).toBe('hero-1')
  })

  it('defaults to ctx.sourceCardId when no explicit heroId is given', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', ['src-card']))
    const { emitter } = makeEmitter()

    new DestroyTask().execute(gs, makeCtx('src-card'), emitter, stubRm)

    expect(gs.getParty('p1').getHeroIds()).not.toContain('src-card')
    expect(gs.getDiscardPile().getAll()).toContain('src-card')
  })

  it('emits nothing when the hero is not in the party', () => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', []))
    const { emitter, emitted } = makeEmitter()

    new DestroyTask('missing').execute(gs, makeCtx(), emitter, stubRm)

    expect(emitted).toHaveLength(0)
  })
})
