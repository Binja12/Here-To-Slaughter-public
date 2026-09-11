import { CardType, GameEventType, HeroClass, IGameEvent } from 'shared'
import { SuspiciouslyShinyCoinAbility } from './suspiciously-shiny-coin-ability'
import { GameState } from '../../pipelines/game-state'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { HeroCard } from '../../cards/hero-card'
import { ItemCard } from '../../cards/item-card'
import { MagicCard } from '../../cards/magic-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { GameEventFactory } from '../../events/game-event-factory'
import { PlayItemAction } from '../../actions/play-item-action'

const COIN = 'item-073'

// ---------------------------------------------------------------------------
// Suspiciously Shiny Coin — the reference CURSED item: it rides an opponent's
// hero and taxes that opponent.
// ---------------------------------------------------------------------------

function setup({ play = true }: { play?: boolean } = {}) {
  const gs = new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

  gs.registerPlayer(
    new Player({
      id: 'p1',
      name: 'P1',
      hand: [COIN, 'p1-card'],
      partyId: 'p1-party',
      actionPoints: 3,
    }),
  )
  gs.registerParty(
    new Party({
      playerId: 'p1',
      leaderId: 'p1-leader',
      heroIds: [],
      monsterIds: [],
    }),
  )

  const victim = new Player({
    id: 'p2',
    name: 'P2',
    hand: ['v-1', 'v-2'],
    partyId: 'p2-party',
    actionPoints: 3,
  })
  gs.registerPlayer(victim)
  gs.registerParty(
    new Party({
      playerId: 'p2',
      leaderId: 'p2-leader',
      heroIds: ['carrier', 'other-hero'],
      monsterIds: [],
    }),
  )
  gs.setCurrentPlayerId('p1')

  for (const id of ['carrier', 'other-hero']) {
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
  for (const id of ['p1-card', 'v-1', 'v-2']) {
    gs.registerCard(
      new MagicCard({
        id,
        name: id,
        type: CardType.Magic,
        image: '',
        description: '',
        set: 'base',
      }),
    )
  }
  gs.registerCard(
    new ItemCard({
      id: COIN,
      name: 'Suspiciously Shiny Coin',
      type: CardType.Item,
      image: '',
      description: '',
      set: 'base',
      cursed: true,
    }),
  )

  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  new TaskManager(gs, em, rm, new Map([[COIN, SuspiciouslyShinyCoinAbility]]))

  // p1 plays the cursed coin onto p2's hero — the only legal use for it —
  // and nobody challenges it.
  if (play) {
    new PlayItemAction('a1', 'p1', COIN, 'carrier', rm, em).execute(gs)
    jest.advanceTimersByTime(5000)
  }

  return { gs, em, events, victim }
}

const openWindow = (gs: GameState) =>
  [...gs.getFrames().values()].flatMap((f) => f.windows).find((w) => w.isOpen())

describe('SuspiciouslyShinyCoinAbility', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it('is one entry, scoped to the hero carrying it', () => {
    expect(SuspiciouslyShinyCoinAbility).toHaveLength(1)
    expect(SuspiciouslyShinyCoinAbility[0].trigger.on).toBe(
      GameEventType.RollSuccess,
    )
  })

  it('asks the CARRIER OWNER for a card when they roll on it', () => {
    const { gs, em } = setup()

    em.emit(GameEventFactory.rollSuccess('p2', 'carrier'))

    // The item's ability is derived from its position, so the prompt belongs
    // to the party it sits in — the player who rolled, not the one who
    // played the coin.
    const opened = openWindow(gs)
    expect(opened).toBeDefined()
    opened!.submitReaction('p2', { choice: 'v-1' })

    expect(gs.getPlayer('p2')!.getHand()).toEqual(['v-2'])
    expect(gs.getDiscardPile().getAll()).toContain('v-1')
    expect(gs.getPlayer('p1')!.getHand()).toContain('p1-card')
  })

  it('does nothing when its owner rolls on a DIFFERENT hero', () => {
    const { gs, em } = setup()

    em.emit(GameEventFactory.rollSuccess('p2', 'other-hero'))

    // CarrierCard, not OwnerEvent: only the hero wearing the coin is taxed.
    expect(openWindow(gs)).toBeUndefined()
    expect(gs.getPlayer('p2')!.getHand()).toEqual(['v-1', 'v-2'])
  })

  it('does nothing while the coin is still in hand', () => {
    const { gs, em } = setup({ play: false })

    em.emit(GameEventFactory.rollSuccess('p2', 'carrier'))

    // Unequipped, it has no carrier, so nothing is scanned and nothing fires.
    expect(openWindow(gs)).toBeUndefined()
    expect(gs.getPlayer('p2')!.getHand()).toEqual(['v-1', 'v-2'])
  })

  it('taxes an idle player too — the discard is a cost, not an offer', () => {
    const { gs, em } = setup()

    em.emit(GameEventFactory.rollSuccess('p2', 'carrier'))
    jest.advanceTimersByTime(5000)

    // A card choice defaults to a random one of its options, so waiting does
    // not dodge the coin.
    expect(gs.getPlayer('p2')!.getHand()).toHaveLength(1)
    expect(gs.getDiscardPile().getAll()).toHaveLength(1)
  })

  it('leaves nothing pending once the discard is taken', () => {
    const { gs, em } = setup()

    em.emit(GameEventFactory.rollSuccess('p2', 'carrier'))
    jest.advanceTimersByTime(5000)

    expect(gs.getPipelines()).toHaveLength(0)
    expect(gs.getFrames().size).toBe(0)
  })
})
