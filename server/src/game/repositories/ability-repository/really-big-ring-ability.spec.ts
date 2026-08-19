import { CardType, GameEventType, HeroClass, IGameEvent, PassiveType } from 'shared'
import { ReallyBigRingAbility } from './really-big-ring-ability'
import { GameState } from '../../pipelines/game-state'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { HeroCard } from '../../cards/hero-card'
import { ItemCard } from '../../cards/item-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { PlayItemAction } from '../../actions/play-item-action'

const RING = 'item-064'
const SECOND_RING = 'item-065'

// ---------------------------------------------------------------------------
// Really Big Ring — the reference ITEM: an on-equip effect scoped to its
// carrier, ending when that carrier leaves.
// ---------------------------------------------------------------------------

function setup() {
  const gs = new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )
  const player = new Player({
    id: 'p1',
    name: 'P1',
    hand: [RING],
    partyId: 'p1-party',
    actionPoints: 3,
  })
  gs.registerPlayer(player)
  gs.registerParty(
    new Party({
      playerId: 'p1',
      leaderId: 'p1-leader',
      heroIds: ['hero-1', 'hero-2'],
      monsterIds: [],
    }),
  )
  gs.setCurrentPlayerId('p1')

  for (const id of ['hero-1', 'hero-2']) {
    gs.registerCard(
      new HeroCard({
        id,
        name: id,
        type: CardType.Hero,
        image: '',
        description: '',
        set: 'base',
        heroClass: HeroClass.Fighter,
        rollReq: 5,
      }),
    )
  }
  gs.registerCard(
    new ItemCard({
      id: RING,
      name: 'Really Big Ring',
      type: CardType.Item,
      image: '',
      description: '',
      set: 'base',
      cursed: false,
    }),
  )

  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  new TaskManager(
    gs,
    em,
    rm,
    new Map([
      [RING, ReallyBigRingAbility],
      [SECOND_RING, ReallyBigRingAbility],
    ]),
  )

  return { gs, player, em, rm, events }
}

/** Plays the ring onto a hero and lets the challenge lapse uncontested. */
function equipTo(heroId: string) {
  const ctx = setup()
  new PlayItemAction('a1', 'p1', RING, heroId, ctx.rm, ctx.em).execute(ctx.gs)
  jest.advanceTimersByTime(5000)
  return ctx
}

/** What a roll on `heroId` would pick up. Omit it for a challenge roll. */
const bonuses = (gs: GameState, heroId?: string) =>
  gs.getEffects(PassiveType.RollBonus, 'p1', heroId)

describe('ReallyBigRingAbility', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it('is one entry, triggered by the settled challenge', () => {
    expect(ReallyBigRingAbility).toHaveLength(1)
    expect(ReallyBigRingAbility[0].trigger.on).toBe(GameEventType.FrameResolved)
  })

  it('installs a +2 roll bonus once the play survives', () => {
    const { gs } = equipTo('hero-1')

    expect(bonuses(gs, 'hero-1')).toHaveLength(1)
    expect(bonuses(gs, 'hero-1')[0].value).toBe(2)
  })

  it('names the ring as the source, so the roll UI can show where it came from', () => {
    const { gs } = equipTo('hero-1')

    expect(bonuses(gs, 'hero-1')[0].sourceCardId).toBe(RING)
  })

  it('announces the effect', () => {
    const { events } = equipTo('hero-1')

    expect(events.some((e) => e.getType() === GameEventType.EffectApplied)).toBe(
      true,
    )
  })

  it('installs nothing while the ring is still in hand', () => {
    const { gs } = setup()

    expect(bonuses(gs, 'hero-1')).toHaveLength(0)
  })

  it('installs nothing while the challenge is still open', () => {
    const ctx = setup()
    new PlayItemAction('a1', 'p1', RING, 'hero-1', ctx.rm, ctx.em).execute(ctx.gs)

    expect(bonuses(ctx.gs, 'hero-1')).toHaveLength(0)
  })

  // --- Scope: "the equipped Hero card's" roll, not every roll ---

  it('does NOT lift a roll on a different hero', () => {
    const { gs } = equipTo('hero-1')

    expect(bonuses(gs, 'hero-2')).toHaveLength(0)
  })

  it('does NOT lift a challenge roll, which is on no hero at all', () => {
    const { gs } = equipTo('hero-1')

    // ChallengeWindow asks with no card, so a scoped passive stays out.
    expect(bonuses(gs)).toHaveLength(0)
  })

  // --- Lifetime ---

  it('ends when the carrier leaves the party', () => {
    const { gs, em } = equipTo('hero-1')

    gs.getParty('p1').removeHero('hero-1', em, 'Destroyed')

    // The item's own ability dies with the hero's position for free; the
    // effect it installed needs whileEquipped to go with it.
    expect(bonuses(gs, 'hero-1')).toHaveLength(0)
  })

  it('cannot be stacked with a second ring on the same hero', () => {
    const { gs, em, rm } = equipTo('hero-1')
    gs.getPlayer('p1')!.addToHand(SECOND_RING)
    gs.registerCard(
      new ItemCard({
        id: SECOND_RING,
        name: 'Really Big Ring',
        type: CardType.Item,
        image: '',
        description: '',
        set: 'base',
        cursed: false,
      }),
    )

    const action = new PlayItemAction('a2', 'p1', SECOND_RING, 'hero-1', rm, em)

    // One item per hero, so the play is refused rather than swapping.
    expect(action.canExecute(gs)).toBe(false)
    expect(bonuses(gs, 'hero-1')).toHaveLength(1)
    expect(bonuses(gs, 'hero-1')[0].sourceCardId).toBe(RING)
  })

  it('goes on a BARE hero instead, and both bonuses stand', () => {
    const { gs, em, rm } = equipTo('hero-1')
    gs.getPlayer('p1')!.addToHand(SECOND_RING)
    gs.registerCard(
      new ItemCard({
        id: SECOND_RING,
        name: 'Really Big Ring',
        type: CardType.Item,
        image: '',
        description: '',
        set: 'base',
        cursed: false,
      }),
    )

    new PlayItemAction('a2', 'p1', SECOND_RING, 'hero-2', rm, em).execute(gs)
    jest.advanceTimersByTime(5000)

    // Each is scoped to its own carrier, so neither leaks onto the other.
    expect(bonuses(gs, 'hero-1')[0].sourceCardId).toBe(RING)
    expect(bonuses(gs, 'hero-2')[0].sourceCardId).toBe(SECOND_RING)
  })

  it('survives a DIFFERENT hero leaving the party', () => {
    const { gs, em } = equipTo('hero-1')

    gs.getParty('p1').removeHero('hero-2', em, 'Destroyed')

    expect(bonuses(gs, 'hero-1')).toHaveLength(1)
  })

  it('is not installed at all when the challenge is lost', () => {
    const ctx = setup()
    new PlayItemAction('a1', 'p1', RING, 'hero-1', ctx.rm, ctx.em).execute(ctx.gs)

    const window = [...ctx.gs.frames.values()]
      .flatMap((f) => f.windows)
      .find((w) => w.isOpen())!
    // Challenger rolls 11, defender 1.
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.99).mockReturnValueOnce(0)
    window.submitReaction('p1', { type: 'challenge', challengerId: 'p1' })
    jest.advanceTimersByTime(5000)

    // Rolled back out of the party's equipment, so it is not a source when
    // the settled frame is matched.
    expect(ctx.gs.getEquippedItem('hero-1')).toBeUndefined()
    expect(bonuses(ctx.gs, 'hero-1')).toHaveLength(0)
  })
})
