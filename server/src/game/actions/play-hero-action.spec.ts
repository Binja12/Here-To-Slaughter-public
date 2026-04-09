import { ActionType, CardType, GameEventType, HeroClass } from 'shared'
import { PlayHeroAction } from './play-hero-action'
import { GameState } from '../game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { ReactionManager } from '../reactions/reaction-manager'
import { HeroCard } from '../cards/hero-card'

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

const makeGs = () => {
  const deck = new CardStack('deck-1', 'main-deck')
  const discardPile = new CardPile('discard pile', 'discard pile')
  const monsterDeck = new CardStack('monster deck', 'main monster deck')
  const monsterPile = new CardPile('slayable monsters', 'monster pile')
  return new GameState(deck, discardPile, monsterDeck, monsterPile)
}

// --- Tests ---

describe('PlayHeroAction', () => {
  let emitter: GameEventEmitter
  let emitSpy: jest.SpyInstance
  let gs: GameState
  let player: Player
  let party: Party

  beforeEach(() => {
    emitter = new GameEventEmitter()
    emitSpy = jest.spyOn(emitter, 'emit')
    gs = makeGs()
    player = makePlayer('p1', ['hero-1'])
    party = makeParty('p1')
    gs.registerPlayer(player)
    gs.registerParty(party)
    gs.setCurrentPlayerId('p1')
    gs.registerCard(makeHeroCard('hero-1'))
  })

  const makeAction = () => {
    const rm = new ReactionManager(gs, emitter)
    return new PlayHeroAction('a1', 'p1', 'hero-1', rm, emitter)
  }

  // --- Metadata ---

  describe('metadata', () => {
    it('getId returns the action id', () => {
      expect(makeAction().getId()).toBe('a1')
    })

    it('getType returns ActionType.PlayHero', () => {
      expect(makeAction().getType()).toBe(ActionType.PlayHero)
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
      const action = new PlayHeroAction('a1', 'p1', 'hero-1', rm, emitter)
      expect(action.canExecute(emptyGs)).toBe(false)
    })

    it('returns false when player is not the current player', () => {
      gs.setCurrentPlayerId('p2')
      expect(makeAction().canExecute(gs)).toBe(false)
    })

    it('returns false when player has insufficient action points', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', ['hero-1'], 0))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      const rm = new ReactionManager(gs2, emitter)
      const action = new PlayHeroAction('a1', 'p1', 'hero-1', rm, emitter)
      expect(action.canExecute(gs2)).toBe(false)
    })

    it('returns false when card is not in player hand', () => {
      const gs2 = makeGs()
      gs2.registerPlayer(makePlayer('p1', []))
      gs2.registerParty(makeParty('p1'))
      gs2.setCurrentPlayerId('p1')
      const rm = new ReactionManager(gs2, emitter)
      const action = new PlayHeroAction('a1', 'p1', 'hero-1', rm, emitter)
      expect(action.canExecute(gs2)).toBe(false)
    })

    it('returns true when all conditions are met', () => {
      expect(makeAction().canExecute(gs)).toBe(true)
    })
  })

  // --- execute ---

  describe('execute', () => {
    it('decreases player action points by 1', () => {
      makeAction().execute(gs)
      expect(player.getActionPoints()).toBe(2)
    })

    it('removes the card from player hand', () => {
      makeAction().execute(gs)
      expect(player.getHand()).not.toContain('hero-1')
    })

    it('adds the hero to the player party', () => {
      makeAction().execute(gs)
      expect(party.getHeroIds()).toContain('hero-1')
    })

    it('emits two events (card removed from hand, hero added to party)', () => {
      makeAction().execute(gs)
      expect(emitSpy).toHaveBeenCalledTimes(2)
    })
  })
})
