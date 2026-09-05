import { ActionType, CardType, HeroClass, RefusalReason } from 'shared'
import { PlayItemAction } from './play-item-action'
import { GameState } from '../pipelines/game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { ReactionManager } from '../pipelines/reaction-manager'
import { HeroCard } from '../cards/hero-card'
import { ItemCard } from '../cards/item-card'
import { MagicCard } from '../cards/magic-card'

// --- Helpers ---

const makePlayer = (id: string, hand: string[] = [], ap = 3) =>
  new Player({
    id,
    name: `Player ${id}`,
    hand,
    partyId: `party-${id}`,
    actionPoints: ap,
  })

const makeParty = (playerId: string, heroIds: string[] = []) =>
  new Party({
    playerId,
    leaderId: `leader-${playerId}`,
    heroIds,
    monsterIds: [],
  })

const makeHeroCard = (id: string) =>
  new HeroCard({
    id,
    name: `Hero ${id}`,
    type: CardType.Hero,
    image: '',
    description: '',
    heroClass: HeroClass.Wizard,
    rollReq: 4,
    set: '',
  })

const makeItemCard = (id: string, cursed = false) =>
  new ItemCard({
    id,
    name: `Item ${id}`,
    type: CardType.Item,
    image: '',
    description: '',
    set: '',
    cursed,
  })

const makeMagicCard = (id: string) =>
  new MagicCard({
    id,
    name: `Magic ${id}`,
    type: CardType.Magic,
    image: '',
    description: '',
    set: '',
  })

const makeGs = () => {
  const deck = new CardStack('deck-1', 'main-deck')
  const discardPile = new CardPile('discard pile', 'discard pile')
  const monsterDeck = new CardStack('monster deck', 'main monster deck')
  const monsterPile = new CardPile('slayable monsters', 'monster pile')
  return new GameState(deck, discardPile, monsterDeck, monsterPile)
}

// --- Tests ---

describe('PlayItemAction', () => {
  let emitter: GameEventEmitter
  let emitSpy: jest.SpyInstance
  let gs: GameState
  let player: Player
  let party: Party

  beforeEach(() => {
    jest.useFakeTimers()
    emitter = new GameEventEmitter()
    emitSpy = jest.spyOn(emitter, 'emit')
    gs = makeGs()
    player = makePlayer('p1', ['item-1'])
    party = makeParty('p1', ['hero-1'])
    gs.registerPlayer(player)
    gs.registerParty(party)
    gs.setCurrentPlayerId('p1')
    gs.registerCard(makeItemCard('item-1'))
    gs.registerCard(makeHeroCard('hero-1'))
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  /** Nobody spends a challenge card: the window times out uncontested. */
  const unchallenged = () => jest.advanceTimersByTime(5000)

  const makeAction = (targetHeroId = 'hero-1') => {
    const rm = new ReactionManager(gs, emitter)
    return new PlayItemAction('a1', 'p1', 'item-1', targetHeroId, rm, emitter)
  }

  // --- Metadata ---

  describe('metadata', () => {
    it('getId returns the action id', () => {
      expect(makeAction().getId()).toBe('a1')
    })

    it('getType returns ActionType.PlayItem', () => {
      expect(makeAction().getType()).toBe(ActionType.PlayItem)
    })

    it('getPlayerId returns the player id', () => {
      expect(makeAction().getPlayerId()).toBe('p1')
    })

    it('getCost returns 1', () => {
      expect(makeAction().getCost()).toBe(1)
    })
  })

  // --- canExecute ---

  describe('canExecute', () => {
    it('throws when the player is not seated — an engine mistake, not a refusal', () => {
      const emptyGs = makeGs()
      emptyGs.setCurrentPlayerId('p1')
      const rm = new ReactionManager(emptyGs, emitter)
      const action = new PlayItemAction(
        'a1',
        'p1',
        'item-1',
        'hero-1',
        rm,
        emitter,
      )
      expect(() => action.canExecute(emptyGs)).toThrow(/not seated/)
    })

    it('returns false when player has insufficient action points', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', ['item-1'], 0))
      gs2.registerParty(makeParty('p1', ['hero-1']))
      gs2.setCurrentPlayerId('p1')
      gs2.registerCard(makeItemCard('item-1'))
      gs2.registerCard(makeHeroCard('hero-1'))
      const rm = new ReactionManager(gs2, emitter)
      const action = new PlayItemAction(
        'a1',
        'p1',
        'item-1',
        'hero-1',
        rm,
        emitter,
      )
      expect(action.canExecute(gs2)).toEqual({ accepted: false, reason: RefusalReason.NoActionPoints })
    })

    it('returns false when item is not in player hand', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', []))
      gs2.registerParty(makeParty('p1', ['hero-1']))
      gs2.setCurrentPlayerId('p1')
      gs2.registerCard(makeItemCard('item-1'))
      gs2.registerCard(makeHeroCard('hero-1'))
      const rm = new ReactionManager(gs2, emitter)
      const action = new PlayItemAction(
        'a1',
        'p1',
        'item-1',
        'hero-1',
        rm,
        emitter,
      )
      expect(action.canExecute(gs2)).toEqual({ accepted: false, reason: RefusalReason.CardNotInHand })
    })

    it('returns false when target card does not exist', () => {
      expect(makeAction('nonexistent-hero').canExecute(gs)).toEqual({ accepted: false, reason: RefusalReason.NotAHero })
    })

    it('returns false when target card is not a Hero type', () => {
      gs.registerCard(makeMagicCard('magic-target'))
      expect(makeAction('magic-target').canExecute(gs)).toEqual({ accepted: false, reason: RefusalReason.NotAHero })
    })

    it('returns true when item targets own hero', () => {
      expect(makeAction('hero-1').canExecute(gs)).toEqual({ accepted: true })
    })

    it("a plain item dresses an opponent's bare hero too — the rules do not say whose (the owner, 2026-09-04)", () => {
      const opponent = makePlayer('p2')
      const opponentParty = makeParty('p2', ['enemy-hero'])
      gs.registerPlayer(opponent)
      gs.registerParty(opponentParty)
      gs.registerCard(makeHeroCard('enemy-hero'))
      expect(makeAction('enemy-hero').canExecute(gs)).toEqual({ accepted: true })
    })
  })

  // --- execute ---

  it('canExecute is false when the target hero already carries an item', () => {
    gs.getParty('p1').equipItem('hero-1', 'other-item')

    // One item per hero: the request is refused rather than swapping.
    expect(makeAction().canExecute(gs)).toEqual({ accepted: false, reason: RefusalReason.HeroAlreadyEquipped })
  })

  describe('execute', () => {
    it('decreases player action points by 1', () => {
      makeAction().execute(gs)
      expect(player.getActionPoints()).toBe(2)
    })

    it('removes the item from player hand', () => {
      makeAction().execute(gs)
      expect(player.getHand()).not.toContain('item-1')
    })

    it('equips the item to the target hero', () => {
      makeAction().execute(gs)
      unchallenged()
      // Party state, not card state, so a frame rollback covers it.
      expect(gs.getEquippedItem('hero-1')).toBe('item-1')
    })

    it('equips inside the frame, so a lost challenge un-equips it', () => {
      makeAction().execute(gs)
      const window = [...gs.getFrames().values()]
        .flatMap((f) => f.windows)
        .find((w) => w.isOpen())!

      // Challenger rolls 11, defender 1.
      jest.spyOn(Math, 'random').mockReturnValueOnce(0.99).mockReturnValueOnce(0.99).mockReturnValueOnce(0).mockReturnValueOnce(0)
      window.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      unchallenged()

      expect(gs.getEquippedItem('hero-1')).toBeUndefined()
      // Spent either way: out of hand before the snapshot, discarded by the
      // window on the losing branch.
      expect(player.getHand()).not.toContain('item-1')
      expect(gs.getDiscardPile().getAll()).toContain('item-1')
    })

    it('announces the removal and the equip, then opens the challenge', () => {
      makeAction().execute(gs)
      expect(emitSpy).toHaveBeenCalledTimes(3)
    })
  })
})
