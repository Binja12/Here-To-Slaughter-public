import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  ReactionWindowType,
} from 'shared'
import { GameState } from './game-state'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { HeroCard } from '../cards/hero-card'
import { IAbilityRule, IModifiableWindow, IReactionWindow } from '../interfaces'
import { CardPile } from '../state-structures/card-pile'
import { DiscardTask } from '../tasks/tasks'
import { NO_CONTEXT_RESULT } from '../abilities/ability-context'
import { GameEventEmitter } from '../events/game-event-emitter'

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

const makeHeroCard = (id: string, ability?: IAbilityRule) =>
  new HeroCard({
    id,
    name: `Hero ${id}`,
    type: CardType.Hero,
    image: '',
    description: '',
    heroClass: HeroClass.Wizard,
    rollReq: 4,
    set: 'base',
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
    const stubWindow = (isOpen = true): IReactionWindow => ({
      getId: () => 'w1',
      getType: () => ReactionWindowType.Modifier,
      getRespondentId: () => 'p1',
      getOptions: () => [],
      isOpen: () => isOpen,
      submitReaction: () => {},
      resolve: () => {},
      resultKey: () => NO_CONTEXT_RESULT,
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

    describe('spendCard', () => {
      beforeEach(() => {
        const player = makePlayer('p1')
        player.addToHand('mod-1')
        gs.registerPlayer(player)
        gs.registerParty(makeParty('p1', 'leader-1'))
        gs.addFrame('f1', { snapshot: gs.clone(), windows: [] })
      })

      it('removes the card from the current player hand', () => {
        gs.spendCard('p1', 'mod-1')
        expect(gs.getPlayer('p1')!.getHand()).not.toContain('mod-1')
      })

      it('puts the card in the INSTANCE pile, not the discard', () => {
        gs.spendCard('p1', 'mod-1')
        // Live, it is a card in play for as long as the window it was spent
        // into is open. releaseFrame is what puts it away.
        expect(gs.getParty('p1').getInstanceCardIds()).toContain('mod-1')
        expect(gs.getDiscardPile().getAll()).not.toContain('mod-1')
      })

      it('records it on the frame, and releasing the frame discards it', () => {
        gs.spendCard('p1', 'mod-1')
        expect(gs.isSpentInOpenFrame('mod-1')).toBe(true)

        gs.releaseFrame('f1')

        expect(gs.getParty('p1').getInstanceCardIds()).not.toContain('mod-1')
        expect(gs.getDiscardPile().getAll()).toContain('mod-1')
        expect(gs.isSpentInOpenFrame('mod-1')).toBe(false)
      })

      it('leaves the SNAPSHOT alone — it predates the burn', () => {
        gs.spendCard('p1', 'mod-1')
        const snap = gs.frames.get('f1')!.snapshot
        // The frame records what was spent instead of reaching back into a
        // past GameState to describe a decision the present just made.
        expect(snap.getPlayer('p1')!.getHand()).toContain('mod-1')
        expect(snap.getDiscardPile().getAll()).not.toContain('mod-1')
      })

      it('a ROLLBACK still keeps it spent', () => {
        gs.spendCard('p1', 'mod-1')
        gs.restoreFrame('f1')

        // The snapshot handed the card back to the hand; disposeSpent takes it
        // away again, so both settlement paths end the same way.
        expect(gs.getPlayer('p1')!.getHand()).not.toContain('mod-1')
        expect(gs.getDiscardPile().getAll()).toContain('mod-1')
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

// ---------------------------------------------------------------------------
// The modifiable-window surface
//
// GameState holds the windows, so it answers the questions about them and
// performs the one act. Nothing outside gets a window: callers would end up
// depending on the shape it is handed in and on the wire format a submission
// takes, and both are free to change while these three are not.
// ---------------------------------------------------------------------------

describe('GameState — the open modifiable window', () => {
  const makeGs = () =>
    new GameState(
      new CardStack('deck', 'main'),
      new CardPile('discard', 'discard'),
      new CardStack('mdeck', 'monster-deck'),
      new CardPile('mpile', 'monster-pile'),
    )

  /** Accepts bonuses aimed at `rollerId` only, and biases toward the roller. */
  const modifiableStub = (
    isOpen = true,
    rollerId = 'p1',
  ): IModifiableWindow & { submitReaction: jest.Mock } => ({
    getId: () => 'w1',
    getType: () => ReactionWindowType.Modifier,
    getRespondentId: () => rollerId,
    getOptions: () => [],
    isOpen: () => isOpen,
    submitReaction: jest.fn(),
    resolve: () => {},
    resultKey: () => NO_CONTEXT_RESULT,
    acceptsModifierFor: (playerId: string) => playerId === rollerId,
    cardSpent: () => {},
    valueBiasFor: (playerId: string, targetPlayerId: string) =>
      targetPlayerId === playerId ? 'highest' : 'lowest',
  })

  const withWindow = (window: IReactionWindow) => {
    const gs = makeGs()
    gs.addFrame('f1', { snapshot: gs.clone(), windows: [window] })
    return gs
  }

  describe('acceptsModifierFor', () => {
    it('is false with no window at all', () => {
      expect(makeGs().acceptsModifierFor('p1')).toBe(false)
    })

    it('defers to the window rule', () => {
      const gs = withWindow(modifiableStub())
      expect(gs.acceptsModifierFor('p1')).toBe(true)
      expect(gs.acceptsModifierFor('p2')).toBe(false)
    })

    it('is false once the window has RESOLVED, frame or no frame', () => {
      // resolve() sets the flag and only then releases, so there is a moment
      // where a closed window still sits in a live frame.
      const gs = withWindow(modifiableStub(false))
      expect(gs.acceptsModifierFor('p1')).toBe(false)
    })
  })

  describe('valueBiasFor', () => {
    it('is absent with no window to have a rule', () => {
      expect(makeGs().valueBiasFor('p1', 'p1')).toBeUndefined()
    })

    it('defers to the window rule', () => {
      const gs = withWindow(modifiableStub())
      expect(gs.valueBiasFor('p1', 'p1')).toBe('highest')
      expect(gs.valueBiasFor('p1', 'p2')).toBe('lowest')
    })
  })

  describe('applyModifier', () => {
    it('submits the bonus, naming the kind so a challenge can route it', () => {
      const window = modifiableStub()
      const gs = withWindow(window)

      gs.applyModifier('p2', { value: 3, cardId: 'mod-1', targetPlayerId: 'p1' })

      expect(window.submitReaction).toHaveBeenCalledWith('p2', {
        type: 'modifier',
        value: 3,
        cardId: 'mod-1',
        targetPlayerId: 'p1',
      })
    })

    it('does nothing when the window would REFUSE the target', () => {
      const window = modifiableStub(true, 'p1')
      const gs = withWindow(window)

      gs.applyModifier('p2', { value: 3, cardId: 'mod-1', targetPlayerId: 'p2' })

      expect(window.submitReaction).not.toHaveBeenCalled()
    })

    it('does nothing once the window has resolved — a late bonus is just late', () => {
      const window = modifiableStub(false)
      const gs = withWindow(window)

      gs.applyModifier('p2', { value: 3, cardId: 'mod-1', targetPlayerId: 'p1' })

      expect(window.submitReaction).not.toHaveBeenCalled()
    })

    it('does nothing with no window at all', () => {
      expect(() =>
        makeGs().applyModifier('p2', {
          value: 3,
          cardId: 'mod-1',
          targetPlayerId: 'p1',
        }),
      ).not.toThrow()
    })
  })
})

// ---------------------------------------------------------------------------
// slayMonster — the one way a monster leaves the face-up row
// ---------------------------------------------------------------------------

describe('GameState.slayMonster', () => {
  let gs: GameState
  let em: GameEventEmitter
  let emitted: IGameEvent[]

  beforeEach(() => {
    gs = new GameState(
      new CardStack('deck-1', 'main-deck'),
      new CardPile('discard', 'discard'),
      new CardStack('mdeck', 'monster-deck'),
      new CardPile('mpile', 'monster-pile'),
    )
    gs.registerPlayer(makePlayer('p1'))
    gs.registerParty(makeParty('p1', 'leader-p1'))

    // The visible row of three, with two still face down behind it.
    for (const id of ['m-3', 'm-2', 'm-1']) gs.getMonsterPile().add(id)
    gs.getMonsterDeck().addToBottom('m-4')
    gs.getMonsterDeck().addToBottom('m-5')

    em = new GameEventEmitter()
    emitted = []
    em.addListener({ onEvent: (e) => emitted.push(e) })
  })

  it('takes the monster out of the pile', () => {
    gs.slayMonster('m-2', 'p1', em)
    expect(gs.getMonsterPile().getAll()).not.toContain('m-2')
  })

  it('adds it to the slayer party', () => {
    gs.slayMonster('m-2', 'p1', em)
    expect(gs.getParty('p1').getMonsterIds()).toEqual(['m-2'])
  })

  it('turns the next monster up behind it, keeping the row three wide', () => {
    expect(gs.getMonsterPile().getSize()).toBe(3)

    gs.slayMonster('m-2', 'p1', em)

    expect(gs.getMonsterPile().getSize()).toBe(3)
    expect(gs.getMonsterPile().getAll()).toContain('m-4')
    expect(gs.getMonsterDeck().getSize()).toBe(1)
  })

  it('draws the TOP of the deck, not any of it', () => {
    gs.slayMonster('m-1', 'p1', em)
    gs.slayMonster('m-2', 'p1', em)
    expect(gs.getMonsterPile().getAll()).toEqual(
      expect.arrayContaining(['m-4', 'm-5']),
    )
  })

  it('lets the row shrink once the deck is spent — nothing to draw is not a fault', () => {
    for (const id of ['m-1', 'm-2', 'm-3']) gs.slayMonster(id, 'p1', em)

    expect(gs.getMonsterDeck().getSize()).toBe(0)
    expect(gs.getMonsterPile().getSize()).toBe(2)

    const left = gs.getMonsterPile().getAll()
    expect(() => gs.slayMonster(left[0], 'p1', em)).not.toThrow()
    expect(gs.getMonsterPile().getSize()).toBe(1)
  })

  it('announces MonsterSlain, naming the monster and the slayer', () => {
    gs.slayMonster('m-2', 'p1', em)

    expect(emitted).toHaveLength(1)
    expect(emitted[0].getType()).toBe(GameEventType.MonsterSlain)
    expect(emitted[0].getPlayerId()).toBe('p1')
    expect(emitted[0].getPayload()).toMatchObject({ cardId: 'm-2' })
  })

  it('THROWS on a monster that is not in the row — the row is what you attack', () => {
    expect(() => gs.slayMonster('m-4', 'p1', em)).toThrow(
      /not in the monster pile/,
    )
  })

  it('a monster already won cannot be slain twice', () => {
    gs.slayMonster('m-2', 'p1', em)
    expect(() => gs.slayMonster('m-2', 'p1', em)).toThrow(
      /not in the monster pile/,
    )
    expect(gs.getParty('p1').getMonsterIds()).toEqual(['m-2'])
  })

  it('draws nothing extra when it throws', () => {
    expect(() => gs.slayMonster('m-4', 'p1', em)).toThrow()
    expect(gs.getMonsterDeck().getSize()).toBe(2)
    expect(emitted).toHaveLength(0)
  })
})
