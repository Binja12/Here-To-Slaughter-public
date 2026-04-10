import { CardType, HeroClass, EffectDuration, ReactionWindowType } from 'shared'
import { GameState } from './game-state'
import { Player } from './player'
import { Party } from './party'
import { CardStack } from './card-stack'
import { HeroCard } from './cards/hero-card'
import { IAbility } from './interfaces'
import { GameEventType } from 'shared'
import { CardPile } from './card-pile'
import { DiscardTask } from './tasks/tasks'

const makePlayer = (id: string) =>
  new Player({
    id,
    name: `Player ${id}`,
    hand: [],
    partyId: `party-${id}`,
    actionPoints: 3,
  })

const makeParty = (
  playerId: string,
  leaderId: string,
  heroIds: string[] = [],
) => new Party({ playerId, leaderId, heroIds, monsterIds: [] })

const makeHeroCard = (id: string, ability?: IAbility) =>
  new HeroCard({
    id,
    name: `Hero ${id}`,
    type: CardType.Hero,
    image: '',
    description: '',
    heroClass: HeroClass.Wizard,
    rollReq: 4,
    set: 'base',
    ability: { trigger: GameEventType.CardPlayed },
  })

describe('GameState', () => {
  let gs: GameState
  let deck = new CardStack('deck-1', 'main-deck')
  let discardPile = new CardPile('discard pile', 'discard pile')
  let monsterDeck = new CardStack('monster deck', 'main monster deck')
  let monsterPile = new CardPile('slayable monsters', 'monster pile')
  beforeEach(() => {
    deck = new CardStack('deck-1', 'main-deck')
    discardPile = new CardPile('discard pile', 'discard pile')
    monsterDeck = new CardStack('monster deck', 'main monster deck')
    monsterPile = new CardPile('slayable monsters', 'monster pile')
    gs = new GameState(deck, discardPile, monsterDeck, monsterPile)
  })

  // --- Registration & retrieval ---

  it('should register and retrieve a player', () => {
    const player = makePlayer('p1')
    gs.registerPlayer(player)
    expect(gs.getPlayer('p1')).toBe(player)
  })

  it('should return undefined for unknown player', () => {
    expect(gs.getPlayer('unknown')).toBeUndefined()
  })

  it('should return all registered players', () => {
    gs.registerPlayer(makePlayer('p1'))
    gs.registerPlayer(makePlayer('p2'))
    expect(gs.getPlayers()).toHaveLength(2)
  })

  it('should register and retrieve a party', () => {
    const party = makeParty('p1', 'leader-1')
    gs.registerParty(party)
    expect(gs.getParty('p1')).toBe(party)
  })

  it('should throw when party not found', () => {
    expect(() => gs.getParty('unknown')).toThrow()
  })

  it('should register and retrieve a card', () => {
    const card = makeHeroCard('hero-1')
    gs.registerCard(card)
    expect(gs.getCard('hero-1')).toBe(card)
  })

  it('should return undefined for unknown card', () => {
    expect(gs.getCard('ghost')).toBeUndefined()
  })

  // --- Deck ---

  it('should return the main deck', () => {
    expect(gs.getMainDeck()).toBe(deck)
  })

  // --- Turn state ---

  it('should start with no current player', () => {
    expect(gs.getCurrentPlayerId()).toBeUndefined()
  })

  it('should set and get current player', () => {
    gs.setCurrentPlayerId('p1')
    expect(gs.getCurrentPlayerId()).toBe('p1')
  })

  it('should mark and retrieve abilities used this turn', () => {
    gs.markAbilityUsed('hero-1')
    gs.markAbilityUsed('hero-2')
    expect(gs.getAbilitiesUsedThisTurn()).toEqual(['hero-1', 'hero-2'])
  })

  it('should clear abilities used this turn', () => {
    gs.markAbilityUsed('hero-1')
    gs.clearUsedAbilities()
    expect(gs.getAbilitiesUsedThisTurn()).toHaveLength(0)
  })

  // --- Card ownership ---

  it('should find owner of a card in hand', () => {
    const player = makePlayer('p1')
    player.addToHand('card-5')
    gs.registerPlayer(player)
    gs.registerParty(makeParty('p1', 'leader-1'))
    expect(gs.getCardOwner('card-5')).toBe('p1')
  })

  it('should find owner of a hero in party', () => {
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', 'leader-1', ['hero-7']))
    expect(gs.getCardOwner('hero-7')).toBe('p1')
  })

  it('should return undefined for unowned card', () => {
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', 'leader-1'))
    expect(gs.getCardOwner('ghost')).toBeUndefined()
  })

  // --- Frames ---

  describe('frames', () => {
    const stubWindow = (isOpen = true) => ({
      getId: () => 'w1',
      getType: () => ReactionWindowType.Modifier,
      isOpen: () => isOpen,
      submitReaction: () => {},
      resolve: () => {},
    })

    it('frame is present after addFrame', () => {
      gs.addFrame('f1', { snapshot: gs.clone(), windows: [] })
      expect(gs.frames.has('f1')).toBe(true)
    })

    it('frame is absent after releaseFrame', () => {
      gs.addFrame('f1', { snapshot: gs.clone(), windows: [] })
      gs.releaseFrame('f1')
      expect(gs.frames.has('f1')).toBe(false)
    })

    it('restoreFrame reverts mutations made after the snapshot', () => {
      const snapshot = gs.clone()
      gs.addFrame('f1', { snapshot, windows: [] })
      gs.markAbilityUsed('hero-x')
      gs.restoreFrame('f1')
      expect(gs.getAbilitiesUsedThisTurn()).not.toContain('hero-x')
    })

    it('frame is absent after restoreFrame', () => {
      gs.addFrame('f1', { snapshot: gs.clone(), windows: [] })
      gs.restoreFrame('f1')
      expect(gs.frames.has('f1')).toBe(false)
    })

    it('hasOpenFrames returns false with no frames', () => {
      expect(gs.hasOpenFrames()).toBe(false)
    })

    it('hasOpenFrames returns true when a frame has an open window', () => {
      gs.addFrame('f1', { snapshot: gs.clone(), windows: [stubWindow(true)] })
      expect(gs.hasOpenFrames()).toBe(true)
    })

    it('hasOpenFrames returns false when all windows are closed', () => {
      gs.addFrame('f1', { snapshot: gs.clone(), windows: [stubWindow(false)] })
      expect(gs.hasOpenFrames()).toBe(false)
    })

    it('getFrameByWindowType finds a frame by window type', () => {
      gs.addFrame('f1', { snapshot: gs.clone(), windows: [stubWindow()] })
      expect(gs.getFrameByWindowType(ReactionWindowType.Modifier)).toBeDefined()
    })

    it('getFrameByWindowType returns undefined for a non-matching type', () => {
      gs.addFrame('f1', { snapshot: gs.clone(), windows: [stubWindow()] })
      expect(gs.getFrameByWindowType(ReactionWindowType.Challenge)).toBeUndefined()
    })

    it('getFrameByWindowId finds a frame by window id', () => {
      gs.addFrame('f1', { snapshot: gs.clone(), windows: [stubWindow()] })
      expect(gs.getFrameByWindowId('w1')).toBeDefined()
    })

    it('getFrameByWindowId returns undefined for an unknown window id', () => {
      gs.addFrame('f1', { snapshot: gs.clone(), windows: [stubWindow()] })
      expect(gs.getFrameByWindowId('no-such-window')).toBeUndefined()
    })

    describe('burnCard', () => {
      beforeEach(() => {
        const player = makePlayer('p1')
        player.addToHand('mod-1')
        gs.registerPlayer(player)
        gs.registerParty(makeParty('p1', 'leader-1'))
        gs.addFrame('f1', { snapshot: gs.clone(), windows: [] })
      })

      it('removes the card from the current player hand', () => {
        gs.burnCard('f1', 'p1', 'mod-1')
        expect(gs.getPlayer('p1')!.getHand()).not.toContain('mod-1')
      })

      it('adds the card to the current discard pile', () => {
        gs.burnCard('f1', 'p1', 'mod-1')
        expect(gs.getDiscardPile().getAll()).toContain('mod-1')
      })

      it('removes the card from the snapshot player hand', () => {
        gs.burnCard('f1', 'p1', 'mod-1')
        const snap = gs.frames.get('f1')!.snapshot
        expect(snap.getPlayer('p1')!.getHand()).not.toContain('mod-1')
      })

      it('adds the card to the snapshot discard pile', () => {
        gs.burnCard('f1', 'p1', 'mod-1')
        const snap = gs.frames.get('f1')!.snapshot
        expect(snap.getDiscardPile().getAll()).toContain('mod-1')
      })
    })
  })

  // --- getAllActiveCards ---

  it('should return all party leaders and heroes', () => {
    gs.registerParty(makeParty('p1', 'leader-1', ['hero-1', 'hero-2']))
    gs.registerParty(makeParty('p2', 'leader-2', ['hero-3']))
    const active = gs.getAllActiveCards()
    expect(active).toContain('leader-1')
    expect(active).toContain('hero-1')
    expect(active).toContain('hero-2')
    expect(active).toContain('leader-2')
    expect(active).toContain('hero-3')
  })
})
