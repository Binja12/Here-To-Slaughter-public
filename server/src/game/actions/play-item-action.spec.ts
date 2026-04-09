import { ActionType, CardType, GameEventType, HeroClass } from 'shared'
import { PlayItemAction } from './play-item-action'
import { GameState } from '../game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { ReactionManager } from '../reactions/reaction-manager'
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
    ability: { trigger: GameEventType.CardPlayed },
  })

const makeItemCard = (id: string, cursed = false) =>
  new ItemCard({
    id,
    name: `Item ${id}`,
    type: CardType.Item,
    image: '',
    description: '',
    set: '',
    ability: { trigger: GameEventType.CardPlayed },
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
    ability: { trigger: GameEventType.CardPlayed },
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
    it('returns false when player does not exist', () => {
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
      expect(action.canExecute(emptyGs)).toBe(false)
    })

    it('returns false when player is not the current player', () => {
      gs.setCurrentPlayerId('p2')
      expect(makeAction().canExecute(gs)).toBe(false)
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
      expect(action.canExecute(gs2)).toBe(false)
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
      expect(action.canExecute(gs2)).toBe(false)
    })

    it('returns false when target card does not exist', () => {
      expect(makeAction('nonexistent-hero').canExecute(gs)).toBe(false)
    })

    it('returns false when target card is not a Hero type', () => {
      gs.registerCard(makeMagicCard('magic-target'))
      expect(makeAction('magic-target').canExecute(gs)).toBe(false)
    })

    it('returns true when item targets own hero', () => {
      expect(makeAction('hero-1').canExecute(gs)).toBe(true)
    })

    it("non-cursed item targeting an opponent hero can't execute", () => {
      const opponent = makePlayer('p2')
      const opponentParty = makeParty('p2', ['enemy-hero'])
      gs.registerPlayer(opponent)
      gs.registerParty(opponentParty)
      gs.registerCard(makeHeroCard('enemy-hero'))
      expect(makeAction('enemy-hero').canExecute(gs)).toBe(false)
    })
  })

  // --- execute ---

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
      const heroCard = gs.getCard('hero-1') as HeroCard
      expect(heroCard.getEquippedItem()).toBe('item-1')
    })

    it('emits two events (card removed from hand, item equipped to hero)', () => {
      makeAction().execute(gs)
      expect(emitSpy).toHaveBeenCalledTimes(2)
    })
  })
})
