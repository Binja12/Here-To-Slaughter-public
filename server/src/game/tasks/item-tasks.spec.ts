import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  ReactionWindowType,
} from 'shared'
import { PlayItem, PlayItemTask } from './item-tasks'
import { GameState } from '../pipelines/game-state'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { HeroCard } from '../cards/hero-card'
import { ItemCard } from '../cards/item-card'
import { MagicCard } from '../cards/magic-card'
import {
  AbilityContext,
  CTX_CHOSEN_CARD,
  CTX_DRAWN_CARD_IDS,
} from '../abilities/ability-context'
import { GameEventEmitter } from '../events/game-event-emitter'
import { ReactionManager } from '../pipelines/reaction-manager'

// --- Helpers ---

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

const makeHero = (id: string) =>
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

const makeItem = (id: string, cursed = false) =>
  new ItemCard({
    id,
    name: id,
    type: CardType.Item,
    image: '',
    description: '',
    set: 'test',
    cursed,
  })

// ---------------------------------------------------------------------------
// PlayItemTask — the same mechanic as PlayItemAction, discovered at runtime
// instead of constructed with its targets.
// ---------------------------------------------------------------------------

describe('PlayItemTask', () => {
  let gs: GameState
  let emitter: GameEventEmitter
  let emitted: IGameEvent[]
  let player: Player
  let rm: ReactionManager

  beforeEach(() => {
    jest.useFakeTimers()
    gs = makeGs()
    emitter = new GameEventEmitter()
    emitted = []
    emitter.addListener({ onEvent: (e) => emitted.push(e) })

    player = makePlayer('p1', ['item-1'])
    gs.registerPlayer(player)
    gs.registerParty(makeParty('p1', ['hero-1']))
    gs.registerPlayer(makePlayer('p2'))
    gs.registerParty(makeParty('p2', ['hero-2']))

    gs.registerCard(makeHero('hero-1'))
    gs.registerCard(makeHero('hero-2'))
    gs.registerCard(makeItem('item-1'))
    rm = new ReactionManager(gs, emitter)
  })

  afterEach(() => jest.useRealTimers())

  /** Nobody spends a challenge card: the window times out uncontested. */
  const unchallenged = () => jest.advanceTimersByTime(5000)

  const ctxWith = (slots: Record<string, string[]>) => {
    const ctx = new AbilityContext('src-card', 'p1')
    for (const [key, value] of Object.entries(slots)) ctx.set(key, value)
    return ctx
  }

  const run = (task: PlayItemTask, ctx: AbilityContext) =>
    task.execute(gs, ctx, emitter, rm)

  const bothSlots = (itemId: string, heroId: string) =>
    ctxWith({ [CTX_DRAWN_CARD_IDS]: [itemId], [CTX_CHOSEN_CARD]: [heroId] })

  const play = () => new PlayItemTask(CTX_DRAWN_CARD_IDS)

  // --- The mechanic ---

  it('takes the item out of hand and equips it to the chosen hero', () => {
    run(play(), bothSlots('item-1', 'hero-1'))

    expect(player.getHand()).not.toContain('item-1')
    expect(gs.getEquippedItem('hero-1')).toBe('item-1')
  })

  it('records the carrier, readable from either end', () => {
    run(play(), bothSlots('item-1', 'hero-1'))

    // TriggerScope.CarrierCard reads hero -> item; whileEquipped
    // reads item -> hero. Both come off the party record.
    expect(gs.getItemCarrier('item-1')).toBe('hero-1')
  })

  it('equips inside the frame, so a lost challenge takes it back', () => {
    run(play(), bothSlots('item-1', 'hero-1'))
    const window = [...gs.frames.values()]
      .flatMap((f) => f.windows)
      .find((w) => w.isOpen())!

    // Challenger rolls 11, defender 1.
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.99).mockReturnValueOnce(0)
    window.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
    unchallenged()

    expect(gs.getEquippedItem('hero-1')).toBeUndefined()
    // Out of hand before the snapshot; the window puts it in the discard.
    expect(player.getHand()).not.toContain('item-1')
    expect(gs.getDiscardPile().getAll()).toContain('item-1')
    jest.restoreAllMocks()
  })

  it('emits CardRemovedFromHand then ItemEquippedToHero', () => {
    run(play(), bothSlots('item-1', 'hero-1'))

    expect(emitted.map((e) => e.getType()).slice(0, 2)).toEqual([
      GameEventType.CardRemovedFromHand,
      GameEventType.ItemEquippedToHero,
    ])
    const equipped = emitted[1].getPayload() as {
      cardId: string
      heroId: string
    }
    expect(equipped.cardId).toBe('item-1')
    expect(equipped.heroId).toBe('hero-1')
  })

  it('refuses a hero who is already carrying something', () => {
    gs.getParty('p1').equipItem('hero-1', 'old-item')

    run(play(), bothSlots('item-1', 'hero-1'))

    // One item per hero, and a second does not replace the first.
    expect(gs.getEquippedItem('hero-1')).toBe('old-item')
    expect(player.getHand()).toContain('item-1')
    expect(emitted).toHaveLength(0)
  })

  it('throws if the mechanic is reached with an occupied hero', () => {
    // Both wrappers ask canEquip first, so this can only happen by skipping
    // the check — an engine mistake, and it fails where it was made.
    class Bypass extends PlayItem {
      equipAnyway(heroId: string) {
        return this.playItem(gs, 'p1', 'item-1', heroId, emitter, rm)
      }
    }
    gs.getParty('p1').equipItem('hero-1', 'old-item')

    expect(() => new Bypass().equipAnyway('hero-1')).toThrow(/already carries/)
  })

  // --- Whose hero ---

  it('opens a challenge window on the item', () => {
    const frameId = run(play(), bothSlots('item-1', 'hero-1'))

    expect(typeof frameId).toBe('string')
    const window = [...gs.frames.values()]
      .flatMap((f) => f.windows)
      .find((w) => w.isOpen())
    expect(window?.getType()).toBe(ReactionWindowType.Challenge)
  })

  it('refuses a plain item aimed at another party', () => {
    run(play(), bothSlots('item-1', 'hero-2'))

    expect(emitted).toHaveLength(0)
    expect(player.getHand()).toContain('item-1')
    expect(gs.getEquippedItem('hero-2')).toBeUndefined()
  })

  it('allows a CURSED item onto another party — that is what it is for', () => {
    gs.registerCard(makeItem('item-1', true))

    run(play(), bothSlots('item-1', 'hero-2'))

    expect(gs.getEquippedItem('hero-2')).toBe('item-1')
    expect(player.getHand()).not.toContain('item-1')
  })

  // --- Slots ---

  it('skips an empty hero slot — a party with no heroes chooses nothing', () => {
    // The choice window over an empty party settles with no pick, and the
    // empty slot travels here.
    run(play(), ctxWith({ [CTX_DRAWN_CARD_IDS]: ['item-1'], [CTX_CHOSEN_CARD]: [] }))

    expect(emitted).toHaveLength(0)
    expect(player.getHand()).toContain('item-1')
  })

  it('skips an empty item slot', () => {
    run(play(), ctxWith({ [CTX_DRAWN_CARD_IDS]: [], [CTX_CHOSEN_CARD]: ['hero-1'] }))

    expect(emitted).toHaveLength(0)
  })

  it('throws when nothing has written the item slot — a mis-declared ability', () => {
    expect(() =>
      run(play(), ctxWith({ [CTX_CHOSEN_CARD]: ['hero-1'] })),
    ).toThrow(CTX_DRAWN_CARD_IDS)
  })

  it('throws when nothing has written the hero slot', () => {
    expect(() =>
      run(play(), ctxWith({ [CTX_DRAWN_CARD_IDS]: ['item-1'] })),
    ).toThrow(CTX_CHOSEN_CARD)
  })

  // --- Runtime guards ---

  it('skips an item that has left the hand since the slot was written', () => {
    player.removeFromHand('item-1')

    run(play(), bothSlots('item-1', 'hero-1'))

    expect(emitted).toHaveLength(0)
  })

  it('skips a card that is not an item', () => {
    gs.registerCard(
      new MagicCard({
        id: 'magic-1',
        name: 'magic',
        type: CardType.Magic,
        image: '',
        description: '',
        set: 'test',
      }),
    )
    player.addToHand('magic-1')

    run(play(), bothSlots('magic-1', 'hero-1'))

    expect(emitted).toHaveLength(0)
    expect(player.getHand()).toContain('magic-1')
  })

  it('skips a target that is not a hero', () => {
    run(play(), bothSlots('item-1', 'p1-leader'))

    expect(emitted).toHaveLength(0)
    expect(player.getHand()).toContain('item-1')
  })

  it('reads the hero from the chosen-card slot by default', () => {
    run(new PlayItemTask(CTX_DRAWN_CARD_IDS), bothSlots('item-1', 'hero-1'))

    expect(gs.getEquippedItem('hero-1')).toBe('item-1')
  })
})
