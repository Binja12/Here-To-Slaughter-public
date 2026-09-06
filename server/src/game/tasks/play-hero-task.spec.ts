import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
} from 'shared'
import { PlayHeroTask } from './play-hero-task'
import { GameState } from '../pipelines/game-state'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { HeroCard } from '../cards/hero-card'
import { MagicCard } from '../cards/magic-card'
import {
  AbilityContext,
  CTX_CHOSEN_CARD,
  CTX_STOLEN_HERO_ID,
} from '../abilities/ability-context'
import { GameEventEmitter } from '../events/game-event-emitter'
import { ReactionManager } from '../pipelines/reaction-manager'

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

// ---------------------------------------------------------------------------
// PlayHeroTask — the same mechanic as PlayHeroAction, discovered at runtime
// instead of constructed with its target.
//
// The roll a played hero is offered is NOT here: it hangs off the settled
// challenge frame, for the action and the task alike. See hero-rules.spec.ts.
// ---------------------------------------------------------------------------

describe('PlayHeroTask', () => {
  // The challenge window this opens runs on a timer; leave none behind.
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const makeMagicCard = (id: string) =>
    new MagicCard({
      id,
      name: id,
      type: CardType.Magic,
      image: '',
      description: '',
      set: 'test',
    })

  /** GameState with p1 holding `hand`, plus a real ReactionManager. */
  const armed = (hand: string[] = ['hero-1']) => {
    const gs = makeGs()
    gs.registerPlayer(makePlayer('p1', hand))
    gs.registerParty(makeParty('p1'))
    gs.registerCard(makeHeroCard('hero-1'))
    gs.registerCard(makeMagicCard('magic-1'))
    const { emitter, emitted } = makeEmitter()
    return { gs, emitter, emitted, rm: new ReactionManager(gs, emitter) }
  }

  const ctxWith = (cards: string[] | undefined) => {
    const ctx = makeCtx()
    if (cards !== undefined) ctx.set(CTX_CHOSEN_CARD, cards)
    return ctx
  }

  it('throws when nothing has written the slot — the ability is mis-declared', () => {
    const { gs, emitter, rm } = armed()
    expect(() =>
      new PlayHeroTask().execute(gs, ctxWith(undefined), emitter, rm),
    ).toThrow(/nothing has written/)
  })

  it('skips an empty slot — the step ahead ran and produced nothing', () => {
    const { gs, emitter, emitted, rm } = armed()
    const frameId = new PlayHeroTask().execute(gs, ctxWith([]), emitter, rm)
    expect(frameId).toBeUndefined()
    expect(emitted).toHaveLength(0)
    expect(gs.getPlayer('p1')!.getHand()).toContain('hero-1')
  })

  it('skips a card that is not a hero', () => {
    const { gs, emitter, rm } = armed(['magic-1'])
    expect(
      new PlayHeroTask().execute(gs, ctxWith(['magic-1']), emitter, rm),
    ).toBeUndefined()
    expect(gs.getParty('p1').getHeroIds()).not.toContain('magic-1')
  })

  it('skips a hero that has left the hand since the slot was written', () => {
    const { gs, emitter, rm } = armed([])
    expect(
      new PlayHeroTask().execute(gs, ctxWith(['hero-1']), emitter, rm),
    ).toBeUndefined()
    expect(gs.getParty('p1').getHeroIds()).not.toContain('hero-1')
  })

  it('moves the hero from hand to party and opens a challenge on it', () => {
    const { gs, emitter, emitted, rm } = armed()

    const frameId = new PlayHeroTask().execute(gs, ctxWith(['hero-1']), emitter, rm)

    expect(gs.getPlayer('p1')!.getHand()).not.toContain('hero-1')
    expect(gs.getParty('p1').getHeroIds()).toContain('hero-1')
    expect(emitted.map((e) => e.getType())).toEqual([
      GameEventType.CardRemovedFromHand,
      GameEventType.HeroAddedToParty,
      GameEventType.ReactionWindowOpened,
    ])
    expect(gs.getFrames().get(frameId as string)).toBeDefined()
  })

  it('returns the frameId, so the declaring entry waits on the challenge', () => {
    const { gs, emitter, rm } = armed()
    const frameId = new PlayHeroTask().execute(gs, ctxWith(['hero-1']), emitter, rm)
    expect(typeof frameId).toBe('string')
  })

  it('snapshots after the hand removal and before the party arrival', () => {
    const { gs, emitter, rm } = armed()

    const frameId = new PlayHeroTask().execute(gs, ctxWith(['hero-1']), emitter, rm)

    const { snapshot } = gs.getFrames().get(frameId as string)!
    // A challenged card is spent either way, so the rollback must not give it
    // back; the party arrival is inside the frame, so the rollback undoes it.
    expect(snapshot.getPlayer('p1')!.getHand()).not.toContain('hero-1')
    expect(snapshot.getParty('p1').getHeroIds()).not.toContain('hero-1')
  })

  it('reads whatever slot it was named, not only the choice slot', () => {
    const { gs, emitter, rm } = armed()
    const ctx = makeCtx()
    ctx.set(CTX_STOLEN_HERO_ID, ['hero-1'])

    new PlayHeroTask(CTX_STOLEN_HERO_ID).execute(gs, ctx, emitter, rm)

    expect(gs.getParty('p1').getHeroIds()).toContain('hero-1')
  })
})
