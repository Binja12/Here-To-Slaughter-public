import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  ReactionWindowType,
} from 'shared'
import { RollOnHeroTask } from './roll-on-hero-task'
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

const makeHeroCard = (id: string, rollReq = 5) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'test',
    heroClass: HeroClass.Fighter,
    rollReq,
  })

// ---------------------------------------------------------------------------
// RollOnHeroTask — the same mechanic as RollOnHeroAction, with no price and a
// target discovered at runtime.
// ---------------------------------------------------------------------------

describe('RollOnHeroTask', () => {
  // The modifier window runs on a timer; leave none behind.
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  const armed = () => {
    const gs = makeGs()
    gs.registerPlayer(
      new Player({ id: 'p1', name: 'p1', hand: [], partyId: 'p1-party', actionPoints: 3 }),
    )
    gs.registerParty(
      new Party({
        playerId: 'p1',
        leaderId: 'p1-leader',
        heroIds: ['hero-1'],
        monsterIds: [],
      }),
    )
    gs.registerCard(makeHeroCard('hero-1'))
    gs.registerCard(
      new MagicCard({
        id: 'magic-1',
        name: 'magic-1',
        type: CardType.Magic,
        image: '',
        description: '',
        set: 'test',
      }),
    )

    const emitter = new GameEventEmitter()
    const emitted: IGameEvent[] = []
    emitter.addListener({ onEvent: (e) => emitted.push(e) })
    return { gs, emitter, emitted, rm: new ReactionManager(gs, emitter) }
  }

  const ctxWith = (cards: string[] | undefined, sourceCardId = 'src-card') => {
    const ctx = new AbilityContext(sourceCardId, 'p1')
    if (cards !== undefined) ctx.set(CTX_CHOSEN_CARD, cards)
    return ctx
  }

  // --- the slot contract ---

  it('throws when the slot it was named holds nothing — a mis-declared ability', () => {
    const { gs, emitter, rm } = armed()
    expect(() =>
      new RollOnHeroTask(CTX_CHOSEN_CARD).execute(gs, ctxWith(undefined), emitter, rm),
    ).toThrow(/nothing has written/)
  })

  it('skips an empty slot — the step ahead ran and produced nothing', () => {
    const { gs, emitter, emitted, rm } = armed()
    expect(
      new RollOnHeroTask(CTX_CHOSEN_CARD).execute(gs, ctxWith([]), emitter, rm),
    ).toBeUndefined()
    expect(emitted).toHaveLength(0)
  })

  it('reads whatever slot it was named, not only the choice slot', () => {
    const { gs, emitter, emitted, rm } = armed()
    const ctx = ctxWith(undefined)
    ctx.set(CTX_STOLEN_HERO_ID, ['hero-1'])

    new RollOnHeroTask(CTX_STOLEN_HERO_ID).execute(gs, ctx, emitter, rm)

    const rolled = emitted.find((e) => e.getType() === GameEventType.DiceRolled)
    expect((rolled!.getPayload() as { cardId: string }).cardId).toBe('hero-1')
  })

  it('falls back to the card whose entry it is when named no slot at all', () => {
    const { gs, emitter, emitted, rm } = armed()

    new RollOnHeroTask().execute(gs, ctxWith(undefined, 'hero-1'), emitter, rm)

    const rolled = emitted.find((e) => e.getType() === GameEventType.DiceRolled)
    expect((rolled!.getPayload() as { cardId: string }).cardId).toBe('hero-1')
  })

  // --- the roll itself ---

  it('skips a card that is not a hero — there is no roll requirement to meet', () => {
    const { gs, emitter, emitted, rm } = armed()
    expect(
      new RollOnHeroTask(CTX_CHOSEN_CARD).execute(gs, ctxWith(['magic-1']), emitter, rm),
    ).toBeUndefined()
    expect(emitted).toHaveLength(0)
  })

  it('announces the raw die, then opens a modifier window naming the hero', () => {
    const { gs, emitter, emitted, rm } = armed()
    jest.spyOn(Math, 'random').mockReturnValue(0.99) // baseRoll 12

    new RollOnHeroTask(CTX_CHOSEN_CARD).execute(gs, ctxWith(['hero-1']), emitter, rm)

    expect(emitted.map((e) => e.getType())).toEqual([
      GameEventType.DiceRolled,
      GameEventType.ReactionWindowOpened,
    ])
    expect(emitted[1].getPayload()).toMatchObject({
      heroId: 'hero-1',
      baseRoll: 12,
      rollReq: 5,
      rollerId: 'p1',
    })
  })

  it('returns the frameId, so the declaring entry waits on the roll', () => {
    const { gs, emitter, rm } = armed()

    const frameId = new RollOnHeroTask(CTX_CHOSEN_CARD).execute(
      gs,
      ctxWith(['hero-1']),
      emitter,
      rm,
    )

    expect(typeof frameId).toBe('string')
    expect(
      gs.frames.get(frameId as string)!.windows[0].getType(),
    ).toBe(ReactionWindowType.Modifier)
  })

  it('spends the hero ability slot OUTSIDE the frame, so a failed roll keeps it spent', () => {
    const { gs, emitter, rm } = armed()

    const frameId = new RollOnHeroTask(CTX_CHOSEN_CARD).execute(
      gs,
      ctxWith(['hero-1']),
      emitter,
      rm,
    )

    // In the snapshot too, so restoring it cannot hand the roll back.
    expect(gs.getAbilitiesUsedThisTurn()).toContain('hero-1')
    const { snapshot } = gs.frames.get(frameId as string)!
    expect(snapshot.getAbilitiesUsedThisTurn()).toContain('hero-1')
  })
})
